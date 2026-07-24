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
        return (
            f"procesados={self.procesados} creados={self.creados} "
            f"ya_existían={self.omitidos_existente} sin_cuit={self.omitidos_sin_cuit} "
            f"errores={self.errores} contactos={self.contactos_creados} "
            f"dominios={self.dominios_creados}"
        )


def _crear_emails(
    db: Session,
    cliente: Cliente,
    row: dict[str, str],
    dominios_existentes: set[str],
    rep: ReporteSync,
) -> None:
    """Crea contactos por cada email y dominios (salvo públicos/duplicados)."""
    primer_dominio = True
    for email in split_emails(row.get("cust_email")):
        db.add(
            ContactoCliente(
                cliente_id=cliente.id,
                nombre=nombre_contacto(email, cliente.razon_social),
                email=email,
            )
        )
        rep.contactos_creados += 1
        dom = dominio_de(email)
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


def sincronizar_clientes(
    db: Session,
    erp,  # noqa: ANN001 - cualquier objeto con iter_customers()
    *,
    dry_run: bool = False,
    limit: int | None = None,
    batch_size: int = 200,
    on_progress=None,  # noqa: ANN001 - callback(ReporteSync) tras cada lote
) -> ReporteSync:
    """Recorre los clientes del ERP, filtra por tipo y da de alta los nuevos."""
    rep = ReporteSync()

    # Precarga para dedup (una sola query cada uno).
    cuits_existentes = {
        solo_digitos(c) for c in db.scalars(select(Cliente.cuit)) if c
    }
    dominios_existentes = {
        d.lower() for d in db.scalars(select(DominioCliente.dominio)) if d
    }
    cuits_vistos: set[str] = set()
    pendientes = 0  # clientes creados sin commitear todavía (para el commit por lotes)

    for row in erp.iter_customers():
        ck = (row.get("ck_id") or "").strip()
        if ck not in CK_ID_A_CLASE:
            continue  # tipo de cliente que no nos interesa
        rep.procesados += 1
        # Heartbeat: reporta avance aunque estemos salteando existentes (así se
        # ve que sigue viva, no solo cuando crea un lote nuevo).
        if on_progress is not None and rep.procesados % 200 == 0:
            on_progress(rep)
        if limit is not None and rep.procesados > limit:
            rep.procesados -= 1
            break

        cuit = normalizar_cuit(row.get("cust_taxNumber"))
        if cuit is None:
            rep.omitidos_sin_cuit += 1
            logger.info("GBP sync: sin CUIT válido cust_id=%s", row.get("cust_id"))
            continue

        digitos = solo_digitos(cuit)
        if digitos in cuits_existentes or digitos in cuits_vistos:
            rep.omitidos_existente += 1
            continue
        cuits_vistos.add(digitos)

        razon = (row.get("cust_name") or "").strip() or f"Cliente {row.get('cust_id')}"
        cliente = Cliente(
            razon_social=razon,
            cuit=cuit,
            numero_cliente=(row.get("cust_id") or "").strip() or None,
            tipo=CK_ID_A_CLASE[ck],
            telefono=(row.get("cust_phone1") or row.get("cust_phone2") or "").strip()
            or None,
            direccion_facturacion=armar_direccion(
                row.get("cust_address"),
                row.get("cust_city"),
                row.get("cust_zip"),
                row.get("provincia"),  # nombre ya resuelto si se agregó; si no, None
            ),
            direccion_envio=(row.get("cust_address4Delivery") or "").strip() or None,
            activo=True,
        )

        if dry_run:
            rep.creados += 1
            continue

        # Savepoint por cliente: si una fila falla, se revierte SOLO esa fila y la
        # corrida sigue. El commit real (viaje a Neon) se hace por lotes -> mucho
        # más rápido que commitear de a uno.
        try:
            with db.begin_nested():
                db.add(cliente)
                db.flush()  # asigna cliente.id
                _crear_emails(db, cliente, row, dominios_existentes, rep)
            rep.creados += 1
            pendientes += 1
            if pendientes >= batch_size:
                db.commit()
                pendientes = 0
                if on_progress is not None:
                    on_progress(rep)
        except Exception as exc:  # noqa: BLE001 - un cliente malo no corta la corrida
            rep.errores += 1
            rep.detalle_errores.append(f"cust_id={row.get('cust_id')}: {exc}")
            logger.exception("GBP sync: error creando cust_id=%s", row.get("cust_id"))

    if not dry_run:
        db.commit()  # lo que quedó del último lote
    return rep
