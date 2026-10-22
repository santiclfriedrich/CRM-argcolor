"""Carga de presupuestos en GBP: cola que consume el bot (worker self-hosted).

Opera sobre el `Presupuesto` del CRM (no una entidad aparte): el campo
`estado_carga` marca el ciclo `pendiente -> en_proceso -> cargado | error`
(None = nunca se mandó a GBP). El CRM es cola + buzón de PDFs; el bot inicia
todas las conexiones (outbound), así que acá no hay nada que empuje hacia la PC.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.config import get_settings
from app.core.exceptions import NotFoundError
from app.db.models.presupuestos import (
    ENTREGA_OPCIONES,
    IVA_OPCIONES,
    EstadoCargaGbp,
    Presupuesto,
)
from app.schemas.presupuesto_gbp import ItemBotRead, JobBotRead
from app.services.storage import get_storage

logger = logging.getLogger(__name__)
_IVA_VALIDOS = set(IVA_OPCIONES)


def _pdf_key(presupuesto: Presupuesto) -> str:
    return f"presupuestos_gbp/{presupuesto.id}.pdf"


def _item_tipo(sku: str | None) -> str:
    return "normal" if sku else "manual"


def obtener(db: Session, presupuesto_id: int) -> Presupuesto:
    presupuesto = db.scalars(
        select(Presupuesto)
        .where(Presupuesto.id == presupuesto_id)
        .options(selectinload(Presupuesto.items))
    ).first()
    if presupuesto is None:
        raise NotFoundError("Presupuesto no encontrado")
    return presupuesto


def validar_para_gbp(presupuesto: Presupuesto) -> None:
    """Chequea que el presupuesto esté listo para cargarse en GBP. Lanza
    ValueError con un mensaje claro si falta algo."""
    if not presupuesto.cliente_numero:
        raise ValueError("Falta el N° de cliente")
    if presupuesto.entrega_por not in ENTREGA_OPCIONES:
        raise ValueError(f"Entrega inválida. Opciones: {', '.join(ENTREGA_OPCIONES)}")
    if not presupuesto.items:
        raise ValueError("El presupuesto no tiene ítems")
    for it in presupuesto.items:
        if not it.sku and it.iva not in _IVA_VALIDOS:  # manual -> IVA 21/10.5
            raise ValueError(
                f"Ítem manual '{it.descripcion[:40]}': el IVA debe ser 21 o 10.5"
            )


def encolar(db: Session, presupuesto: Presupuesto) -> Presupuesto:
    """Manda el presupuesto a la cola del bot (acción explícita 'Cargar en GBP')."""
    validar_para_gbp(presupuesto)
    presupuesto.estado_carga = EstadoCargaGbp.pendiente.value
    presupuesto.gbp_error = None
    db.commit()
    db.refresh(presupuesto)
    return presupuesto


def _reciclar_colgados(db: Session) -> None:
    """Un job `en_proceso` más del timeout = el bot crasheó. Vuelve a `pendiente`
    (la idempotencia del bot evita duplicar: si ya tiene id_gbp_pedido, no recrea)."""
    limite = datetime.now(timezone.utc) - timedelta(
        minutes=get_settings().GBP_BOT_JOB_TIMEOUT_MIN
    )
    colgados = db.scalars(
        select(Presupuesto).where(
            Presupuesto.estado_carga == EstadoCargaGbp.en_proceso.value,
            Presupuesto.gbp_tomado_en < limite,
        )
    ).all()
    for p in colgados:
        p.estado_carga = EstadoCargaGbp.pendiente.value
        logger.warning("GBP bot: presupuesto %s colgado reciclado a pendiente", p.id)
    if colgados:
        db.commit()


def tomar_siguiente(db: Session) -> Presupuesto | None:
    """Próximo presupuesto `pendiente` (el más viejo), marcándolo `en_proceso`.
    Hay un solo bot, así que alcanza con select + update (sin locking de fila)."""
    _reciclar_colgados(db)
    job = db.scalars(
        select(Presupuesto)
        .where(Presupuesto.estado_carga == EstadoCargaGbp.pendiente.value)
        .order_by(Presupuesto.created_at.asc())
        .options(selectinload(Presupuesto.items))
        .limit(1)
    ).first()
    if job is None:
        return None
    job.estado_carga = EstadoCargaGbp.en_proceso.value
    job.gbp_tomado_en = datetime.now(timezone.utc)
    job.gbp_intentos += 1
    db.commit()
    db.refresh(job)
    return job


def build_job(presupuesto: Presupuesto) -> JobBotRead:
    return JobBotRead(
        id=presupuesto.id,
        cliente_numero=presupuesto.cliente_numero or "",
        entrega_por=presupuesto.entrega_por or "",
        moneda=presupuesto.moneda or "USD",
        documento="Presupuesto USD",
        items=[
            ItemBotRead(
                tipo=_item_tipo(it.sku),
                sku=it.sku,
                descripcion=it.descripcion,
                cantidad=it.cantidad,
                precio_usd=it.precio_unitario,
                iva=it.iva if not it.sku else None,
            )
            for it in presupuesto.items
        ],
    )


def registrar_resultado(
    db: Session, presupuesto_id: int, numero_gbp: str, pdf: bytes
) -> Presupuesto:
    presupuesto = obtener(db, presupuesto_id)
    if not pdf.startswith(b"%PDF"):
        raise ValueError("El archivo subido no es un PDF")
    key = _pdf_key(presupuesto)
    get_storage().put(key, pdf, "application/pdf")
    presupuesto.id_gbp_pedido = numero_gbp.strip() or None
    presupuesto.pdf_gbp_key = key
    presupuesto.estado_carga = EstadoCargaGbp.cargado.value
    presupuesto.gbp_cargado_en = datetime.now(timezone.utc)
    presupuesto.gbp_error = None
    db.commit()
    db.refresh(presupuesto)
    logger.info("GBP bot: presupuesto %s cargado (GBP %s)", presupuesto_id, numero_gbp)
    return presupuesto


def registrar_error(db: Session, presupuesto_id: int, mensaje: str) -> Presupuesto:
    presupuesto = obtener(db, presupuesto_id)
    presupuesto.estado_carga = EstadoCargaGbp.error.value
    presupuesto.gbp_error = mensaje[:2000]
    db.commit()
    db.refresh(presupuesto)
    logger.warning("GBP bot: presupuesto %s con error: %s", presupuesto_id, mensaje[:200])
    return presupuesto
