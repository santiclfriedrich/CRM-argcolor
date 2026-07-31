"""Sincronización one-way de clientes ERP GBP -> CRM.

Trae del ERP solo los tipos de cliente configurados (ck_id) y los da de alta en
el CRM si no existen (dedup por CUIT). De cada email extrae el dominio (creando
`DominioCliente` para el matcheo de la bandeja) y un `ContactoCliente`.

La lógica de mapeo/normalización es pura y testeable; el acceso al ERP se inyecta
(cualquier objeto con `iter_customers()`), para poder testear sin red.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models.clientes import Cliente
from app.db.models.contactos_cliente import ContactoCliente
from app.db.models.dominios_cliente import DominioCliente

logger = logging.getLogger(__name__)

# ck_id del ERP -> "Clase de cliente" del CRM (campo `tipo`). Solo estos se traen.
CK_ID_A_CLASE: dict[str, str] = {
    "17": "Gubernamental",
    "16": "Corporativo",
    "1": "Gremio",
}

# Dominios de correo público/gratuito: NO se crean como DominioCliente porque la
# bandeja matchea por dominio y meter "gmail.com" haría caer cualquier gmail
# ajeno en este cliente. Los emails igual se guardan como contacto.
DOMINIOS_PUBLICOS: frozenset[str] = frozenset(
    {
        "gmail.com", "googlemail.com", "hotmail.com", "hotmail.com.ar",
        "outlook.com", "outlook.com.ar", "live.com", "live.com.ar",
        "yahoo.com", "yahoo.com.ar", "ymail.com", "icloud.com", "me.com",
        "aol.com", "protonmail.com", "proton.me", "gmx.com", "zoho.com",
        "fibertel.com.ar", "speedy.com.ar", "arnet.com.ar", "ciudad.com.ar",
    }
)

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def solo_digitos(valor: str | None) -> str:
    return "".join(ch for ch in (valor or "") if ch.isdigit())


def normalizar_cuit(raw: str | None) -> str | None:
    """11 dígitos -> 'XX-XXXXXXXX-X'. Devuelve None si no son 11 dígitos."""
    d = solo_digitos(raw)
    if len(d) != 11:
        return None
    return f"{d[:2]}-{d[2:10]}-{d[10]}"


def split_emails(raw: str | None) -> list[str]:
    """'a@x.com, b@y.com; c@z.com' -> ['a@x.com', 'b@y.com', 'c@z.com']."""
    if not raw:
        return []
    partes = re.split(r"[,;/\s]+", raw.strip())
    vistos: set[str] = set()
    out: list[str] = []
    for p in partes:
        e = p.strip().lower()
        if e and _EMAIL_RE.match(e) and e not in vistos:
            vistos.add(e)
            out.append(e)
    return out


def dominio_de(email: str) -> str | None:
    return email.rsplit("@", 1)[1].strip().lower() if "@" in email else None


def es_dominio_publico(dominio: str) -> bool:
    return dominio.lower() in DOMINIOS_PUBLICOS


def armar_direccion(
    calle: str | None, localidad: str | None, cp: str | None, provincia: str | None
) -> str | None:
    """Une calle + localidad + CP + provincia en un texto (el CRM guarda la
    dirección como texto libre)."""
    calle = (calle or "").strip()
    localidad = (localidad or "").strip()
    cp = (cp or "").strip()
    provincia = (provincia or "").strip()
    loc = " ".join(x for x in [localidad, f"({cp})" if cp else ""] if x).strip()
    partes = [x for x in [calle, loc, provincia] if x]
    return ", ".join(partes) or None


def nombre_contacto(email: str, razon_social: str) -> str:
    """Nombre del contacto a partir del email (parte local) o la razón social."""
    local = email.split("@", 1)[0].strip()
    return local or razon_social


@dataclass
class ReporteSync:
    procesados: int = 0  # del tipo buscado (ck_id 17/16/1)
    creados: int = 0
    omitidos_existente: int = 0
    omitidos_sin_cuit: int = 0
    errores: int = 0
    contactos_creados: int = 0
    dominios_creados: int = 0
    detalle_errores: list[str] = field(default_factory=list)

    def resumen(self) -> str:
        base = (
            f"procesados={self.procesados} creados={self.creados} "
            f"ya_existían={self.omitidos_existente} sin_cuit={self.omitidos_sin_cuit} "
            f"errores={self.errores} contactos={self.contactos_creados} "
            f"dominios={self.dominios_creados}"
        )
        if self.detalle_errores:
            base += f" | 1er_error: {self.detalle_errores[0]}"
        return base


def _crear_emails(
    db: Session,
    cliente: Cliente,
    row: dict[str, str],
    dominios_existentes: set[str],
    rep: ReporteSync,
) -> None:
    """Crea contactos por cada email y dominios (salvo públicos/propios/dup)."""
    from app.config import settings

    propios = set(settings.company_email_domains)
    primer_dominio = True
    for email in split_emails(row.get("cust_email")):
        dom_email = dominio_de(email)
        # Un email del dominio propio (ej. un vendedor cargado como contacto en
        # GBP) NO es del cliente: no crear contacto ni dominio (evita que
        # argentinacolor.com quede como dominio de un cliente y matchee internos).
        if dom_email and dom_email in propios:
            continue
        db.add(
            ContactoCliente(
                cliente_id=cliente.id,
                nombre=nombre_contacto(email, cliente.razon_social),
                email=email,
            )
        )
        rep.contactos_creados += 1
        dom = dom_email
        if not dom or es_dominio_publico(dom) or dom in dominios_existentes:
            continue
        dominios_existentes.add(dom)
        db.add(
            DominioCliente(
                cliente_id=cliente.id,
                dominio=dom,
                es_principal_dominio=primer_dominio,
            )
        )
        primer_dominio = False
        rep.dominios_creados += 1


# --- Watermark (último cust_id revisado) para el sync incremental ---
_WATERMARK_KEY = "gbp_last_cust_id"


def get_watermark(db: Session) -> int | None:
    """Último cust_id revisado (guardado en `configuracion`). None si no hay."""
    from app.db.models.configuracion import Configuracion

    cfg = db.get(Configuracion, _WATERMARK_KEY)
    if cfg and cfg.valor and "id" in cfg.valor:
        try:
            return int(cfg.valor["id"])
        except (TypeError, ValueError):
            return None
    return None


def set_watermark(db: Session, cust_id: int) -> None:
    from app.db.models.configuracion import Configuracion

    cfg = db.get(Configuracion, _WATERMARK_KEY)
    if cfg is None:
        db.add(Configuracion(clave=_WATERMARK_KEY, valor={"id": int(cust_id)}))
    else:
        cfg.valor = {"id": int(cust_id)}
    db.commit()


def _cust_id_int(row: dict[str, str]) -> int | None:
    try:
        return int((row.get("cust_id") or "").strip())
    except (TypeError, ValueError):
        return None


def _alta_desde_row(
    db: Session, row: dict[str, str], ck: str, dominios_existentes: set[str], rep: ReporteSync
) -> bool:
    """Crea el Cliente + contactos/dominios desde una fila del ERP (ck ya validado
    y CUIT ya chequeado por el caller). Savepoint por fila. True si se creó."""
    razon = (row.get("cust_name") or "").strip() or f"Cliente {row.get('cust_id')}"
    telefono = (row.get("cust_phone1") or row.get("cust_phone2") or "").strip()
    numero = (row.get("cust_id") or "").strip()
    cliente = Cliente(
        # Truncado a los límites de cada columna (el ERP a veces trae datos largos).
        razon_social=razon[:255],
        cuit=normalizar_cuit(row.get("cust_taxNumber")),
        numero_cliente=numero[:40] or None,
        tipo=CK_ID_A_CLASE[ck],
        telefono=telefono[:50] or None,
        direccion_facturacion=armar_direccion(
            row.get("cust_address"), row.get("cust_city"), row.get("cust_zip"), row.get("provincia")
        ),
        direccion_envio=(row.get("cust_address4Delivery") or "").strip() or None,
        activo=True,
    )
    try:
        with db.begin_nested():
            db.add(cliente)
            db.flush()
            _crear_emails(db, cliente, row, dominios_existentes, rep)
        return True
    except Exception as exc:  # noqa: BLE001 - un cliente malo no corta la corrida
        rep.errores += 1
        if len(rep.detalle_errores) < 20:
            rep.detalle_errores.append(f"cust_id={row.get('cust_id')}: {str(exc)[:200]}")
        logger.exception("GBP sync: error creando cust_id=%s", row.get("cust_id"))
        if not db.is_active:
            db.rollback()
        return False


def sincronizar_incremental(
    db: Session,
    erp,  # noqa: ANN001 - objeto con fetch_customer()
    *,
    max_misses: int = 40,
    on_progress=None,  # noqa: ANN001
) -> ReporteSync:
    """Sync RÁPIDO: camina los cust_id nuevos desde el watermark hacia arriba
    (los ids son incrementales), trae 1 por 1 (~0.3s c/u) y da de alta los de
    tipo 1/16/17 que no existan. Corta tras `max_misses` ids inexistentes
    seguidos (= llegó al final; holgura para huecos de borrados).

    Si no hay watermark, hace el scan completo (que lo deja seteado)."""
    watermark = get_watermark(db)
    if watermark is None:
        logger.info("GBP incremental sin watermark -> scan completo inicial")
        return sincronizar_clientes(db, erp, on_progress=on_progress)

    rep = ReporteSync()
    cuits_existentes = {solo_digitos(c) for c in db.scalars(select(Cliente.cuit)) if c}
    dominios_existentes = {d.lower() for d in db.scalars(select(DominioCliente.dominio)) if d}
    cuits_vistos: set[str] = set()

    cid = watermark
    highest = watermark
    misses = 0
    caminados = 0
    while misses < max_misses:
        cid += 1
        row = erp.fetch_customer(cid)
        caminados += 1
        if row is None:
            misses += 1
            continue
        misses = 0
        highest = cid
        ck = (row.get("ck_id") or "").strip()
        if ck in CK_ID_A_CLASE:
            rep.procesados += 1
            cuit = normalizar_cuit(row.get("cust_taxNumber"))
            if cuit is None:
                rep.omitidos_sin_cuit += 1
            elif (d := solo_digitos(cuit)) in cuits_existentes or d in cuits_vistos:
                rep.omitidos_existente += 1
            else:
                cuits_vistos.add(d)
                if _alta_desde_row(db, row, ck, dominios_existentes, rep):
                    rep.creados += 1
                db.commit()  # cierra la transacción antes del próximo fetch
        if on_progress is not None and caminados % 50 == 0:
            on_progress(rep)

    set_watermark(db, highest)
    if on_progress is not None:
        on_progress(rep)
    logger.info(
        "GBP incremental: %s | ids caminados=%s watermark %s->%s",
        rep.resumen(), caminados, watermark, highest,
    )
    return rep


def sincronizar_clientes(
    db: Session,
    erp,  # noqa: ANN001 - cualquier objeto con iter_customers()
    *,
    dry_run: bool = False,
    limit: int | None = None,
    on_progress=None,  # noqa: ANN001 - callback(ReporteSync) tras cada página
) -> ReporteSync:
    """Recorre TODOS los clientes del ERP (todas las páginas), filtra por tipo y
    da de alta los nuevos. Al terminar, guarda el watermark (max cust_id visto)
    para que el sync incremental siga desde ahí."""
    rep = ReporteSync()

    # Precarga para dedup (una sola query cada uno).
    cuits_existentes = {
        solo_digitos(c) for c in db.scalars(select(Cliente.cuit)) if c
    }
    dominios_existentes = {
        d.lower() for d in db.scalars(select(DominioCliente.dominio)) if d
    }
    cuits_vistos: set[str] = set()
    cortar = False
    max_id_visto = get_watermark(db) or 0  # se persiste al final como watermark

    # Iteramos PÁGINA por página y commiteamos al final de cada una. Clave:
    # entre página y página el ERP hace un fetch SOAP lento; si dejáramos la
    # transacción abierta durante ese fetch, Neon la mata por "idle in
    # transaction" y se rompe la conexión (era la causa de los cuelgues/cascadas).
    # Commiteando por página, la transacción está CERRADA durante el fetch.
    for filas in erp.iter_pages():
        for row in filas:
            cid = _cust_id_int(row)
            if cid is not None and cid > max_id_visto:
                max_id_visto = cid  # trackear el max de TODOS los tipos
            ck = (row.get("ck_id") or "").strip()
            if ck not in CK_ID_A_CLASE:
                continue  # tipo de cliente que no nos interesa
            rep.procesados += 1
            if limit is not None and rep.procesados > limit:
                rep.procesados -= 1
                cortar = True
                break

            cuit = normalizar_cuit(row.get("cust_taxNumber"))
            if cuit is None:
                rep.omitidos_sin_cuit += 1
                continue

            digitos = solo_digitos(cuit)
            if digitos in cuits_existentes or digitos in cuits_vistos:
                rep.omitidos_existente += 1
                continue
            cuits_vistos.add(digitos)

            if dry_run:
                rep.creados += 1
                continue

            if _alta_desde_row(db, row, ck, dominios_existentes, rep):
                rep.creados += 1

        # Fin de página: commit (cierra la transacción antes del próximo fetch).
        if not dry_run:
            try:
                db.commit()
            except Exception:  # noqa: BLE001 - si el commit falla, reset y seguimos
                db.rollback()
                logger.exception("GBP sync: error commiteando página")
        if on_progress is not None:
            on_progress(rep)
        if cortar:
            break

    # Baseline para el sync incremental: el mayor cust_id visto (de todos los tipos).
    if not dry_run and max_id_visto:
        try:
            set_watermark(db, max_id_visto)
        except Exception:  # noqa: BLE001 - el watermark no debe romper la corrida
            logger.exception("GBP sync: no se pudo guardar el watermark")

    return rep
