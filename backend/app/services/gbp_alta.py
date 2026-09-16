"""Alta de clientes en GBP desde el CRM (flujo bidireccional).

Crea el cliente en GBP por Web Service, le setea la Clase de Cliente y guarda el
cust_id devuelto como `numero_cliente` del cliente del CRM. Idempotente: si el
CUIT ya existe en GBP (dedup), vincula ese cust_id sin re-crear.
"""

import logging
from typing import Any, Protocol

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models.clientes import Cliente
from app.db.models.contactos_cliente import ContactoCliente
from app.services.gbp_sync import normalizar_cuit, solo_digitos

logger = logging.getLogger(__name__)

# Clase de Cliente (ck_id) según el `tipo` del CRM. Default: Consumidor Final (14).
CLASE_A_CK: dict[str, int] = {"Corporativo": 16, "Gubernamental": 17, "Gremio": 1}
CK_DEFAULT = 14

CUIT_TYPE = "80"  # código AFIP de CUIT para ptaxnumbertype
FISCAL_RESP_INSCRIPTO = "1"  # pfiscalclass IVA Responsable Inscripto (default)


class GBPWriter(Protocol):
    def buscar_por_cuit(self, cuit: str) -> list[dict[str, str]]: ...
    def crear_cliente(self, **kwargs: Any) -> str: ...
    def set_clase_cliente(self, cust_id: int, ck_id: int) -> list[dict[str, str]]: ...


def cuit_valido(raw: str | None) -> bool:
    """Valida CUIT argentino (11 dígitos + dígito verificador mód 11)."""
    d = solo_digitos(raw)
    if len(d) != 11:
        return False
    mult = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
    suma = sum(int(d[i]) * mult[i] for i in range(10))
    resto = 11 - (suma % 11)
    dv = 0 if resto == 11 else (9 if resto == 10 else resto)
    return dv == int(d[10])


def ck_de_tipo(tipo: str | None) -> int:
    return CLASE_A_CK.get((tipo or "").strip(), CK_DEFAULT)


def _email_principal(db: Session, cliente_id: int) -> str:
    """Email del contacto principal (o el primero que tenga) del cliente."""
    contactos = list(
        db.scalars(
            select(ContactoCliente)
            .where(ContactoCliente.cliente_id == cliente_id)
            .order_by(ContactoCliente.es_principal.desc(), ContactoCliente.id.asc())
        )
    )
    for c in contactos:
        if c.email:
            return c.email
    return ""


def crear_cliente_en_gbp(
    db: Session,
    erp: GBPWriter,
    cliente: Cliente,
    *,
    state_id: str,
    fiscalclass: str = FISCAL_RESP_INSCRIPTO,
    taxnumbertype: str = CUIT_TYPE,
    city: str = "",
    zip_code: str = "",
    address: str | None = None,
    email: str | None = None,
    phone: str | None = None,
) -> dict[str, Any]:
    """Da de alta el cliente en GBP y guarda el cust_id como `numero_cliente`.

    Devuelve {cust_id, dedup, clase_ok}. Lanza ValueError con un mensaje claro si
    el CUIT es inválido o si GBP rechaza el alta (código negativo)."""
    cuit = normalizar_cuit(cliente.cuit)
    if not cuit or not cuit_valido(cliente.cuit):
        raise ValueError(
            "El CUIT del cliente es inválido (revisá los 11 dígitos y el dígito verificador)."
        )

    # 1) Dedup por CUIT: si ya existe en GBP, vinculamos ese cust_id y salimos.
    existentes = erp.buscar_por_cuit(cuit)
    for row in existentes:
        cid = row.get("cust_id") or row.get("cust_ID") or row.get("id")
        if cid and str(cid).strip().lstrip("-").isdigit() and int(cid) > 0:
            cliente.numero_cliente = str(int(cid))
            db.commit()
            return {"cust_id": int(cid), "dedup": True, "clase_ok": None}

    # 2) Alta.
    resultado = erp.crear_cliente(
        name=cliente.razon_social or "",
        state=state_id,
        address=(address if address is not None else cliente.direccion_facturacion) or "",
        city=city,
        zip=zip_code,
        fiscalclass=fiscalclass,
        taxnumbertype=taxnumbertype,
        taxnumber=cuit,
        email=(email if email is not None else _email_principal(db, cliente.id)),
        phone=(phone if phone is not None else cliente.telefono) or "",
    )
    try:
        cust_id = int(str(resultado).strip())
    except (TypeError, ValueError) as exc:
        raise ValueError(f"GBP devolvió una respuesta inesperada al alta: {resultado!r}") from exc
    if cust_id <= 0:
        raise ValueError(
            f"GBP rechazó el alta (código {cust_id}). Revisá los datos "
            "(CUIT, provincia, condición IVA)."
        )

    # 3) Clase de Cliente (Corporativo/Gubernamental/Gremio) vía GBPScript.
    ck = ck_de_tipo(cliente.tipo)
    clase_ok = False
    try:
        filas = erp.set_clase_cliente(cust_id, ck)
        clase_ok = any(str(f.get("cust_id", "")).strip() == str(cust_id) for f in filas) or bool(
            filas
        )
    except Exception:  # noqa: BLE001 - el alta ya se hizo; la clase se puede reintentar
        logger.exception("No se pudo setear la clase de cliente en GBP para cust_id=%s", cust_id)

    # 4) Guardar el vínculo bidireccional.
    cliente.numero_cliente = str(cust_id)
    db.commit()
    return {"cust_id": cust_id, "dedup": False, "clase_ok": clase_ok}
