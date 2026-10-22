"""Lógica de los presupuestos a cargar en GBP (cola que consume el bot).

El CRM es una cola + un buzón de PDFs: encola trabajos (`pendiente`), el bot los
toma de a uno (`en_proceso`), y al terminar sube el PDF y marca `cargado`/`error`.
Todas las conexiones las inicia el bot (outbound), así que acá no hay nada que
"empuje" hacia la PC: solo se sirve el próximo job y se registran resultados.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.config import get_settings
from app.core.exceptions import NotFoundError
from app.db.models.presupuestos_gbp import (
    EstadoCargaGbp,
    PresupuestoGbp,
    PresupuestoGbpItem,
)
from app.schemas.presupuesto_gbp import PresupuestoGbpCreate
from app.services.storage import get_storage

logger = logging.getLogger(__name__)


def _pdf_key(presupuesto: PresupuestoGbp) -> str:
    return f"presupuestos_gbp/{presupuesto.id}.pdf"


def crear(
    db: Session, data: PresupuestoGbpCreate, creado_por_id: int | None
) -> PresupuestoGbp:
    estado = (
        EstadoCargaGbp.pendiente.value if data.encolar else EstadoCargaGbp.borrador.value
    )
    presupuesto = PresupuestoGbp(
        oportunidad_id=data.oportunidad_id,
        cliente_numero=data.cliente_numero,
        entrega_por=data.entrega_por,
        estado_carga=estado,
        creado_por_id=creado_por_id,
    )
    for i, item in enumerate(data.items):
        presupuesto.items.append(
            PresupuestoGbpItem(
                orden=i,
                tipo=item.tipo,
                sku=item.sku,
                descripcion=item.descripcion,
                cantidad=item.cantidad,
                precio_usd=item.precio_usd,
                iva=item.iva if item.tipo == "manual" else None,
                fabricante=item.fabricante,
                part_number=item.part_number,
            )
        )
    db.add(presupuesto)
    db.commit()
    db.refresh(presupuesto)
    return presupuesto


def obtener(db: Session, presupuesto_id: int) -> PresupuestoGbp:
    presupuesto = db.scalars(
        select(PresupuestoGbp)
        .where(PresupuestoGbp.id == presupuesto_id)
        .options(selectinload(PresupuestoGbp.items))
    ).first()
    if presupuesto is None:
        raise NotFoundError("Presupuesto no encontrado")
    return presupuesto


def listar(db: Session, estado: str | None = None) -> list[PresupuestoGbp]:
    stmt = select(PresupuestoGbp).order_by(PresupuestoGbp.created_at.desc())
    if estado:
        stmt = stmt.where(PresupuestoGbp.estado_carga == estado)
    return list(db.scalars(stmt))


def _reciclar_colgados(db: Session) -> None:
    """Un job que quedó `en_proceso` más del timeout = el bot crasheó en medio.
    Vuelve a `pendiente` para que se reintente (la idempotencia del bot evita
    duplicar en GBP: antes de crear chequea si ya tiene numero_gbp)."""
    limite = datetime.now(timezone.utc) - timedelta(
        minutes=get_settings().GBP_BOT_JOB_TIMEOUT_MIN
    )
    colgados = db.scalars(
        select(PresupuestoGbp).where(
            PresupuestoGbp.estado_carga == EstadoCargaGbp.en_proceso.value,
            PresupuestoGbp.tomado_en < limite,
        )
    ).all()
    for p in colgados:
        p.estado_carga = EstadoCargaGbp.pendiente.value
        logger.warning("GBP bot: job %s colgado reciclado a pendiente", p.id)
    if colgados:
        db.commit()


def tomar_siguiente(db: Session) -> PresupuestoGbp | None:
    """Devuelve el próximo job `pendiente` (el más viejo) marcándolo `en_proceso`.
    Hay un solo bot, así que no hace falta locking de fila: select + update."""
    _reciclar_colgados(db)
    job = db.scalars(
        select(PresupuestoGbp)
        .where(PresupuestoGbp.estado_carga == EstadoCargaGbp.pendiente.value)
        .order_by(PresupuestoGbp.created_at.asc())
        .options(selectinload(PresupuestoGbp.items))
        .limit(1)
    ).first()
    if job is None:
        return None
    job.estado_carga = EstadoCargaGbp.en_proceso.value
    job.tomado_en = datetime.now(timezone.utc)
    job.intentos += 1
    db.commit()
    db.refresh(job)
    return job


def registrar_resultado(
    db: Session, presupuesto_id: int, numero_gbp: str, pdf: bytes
) -> PresupuestoGbp:
    presupuesto = obtener(db, presupuesto_id)
    if not pdf.startswith(b"%PDF"):
        raise ValueError("El archivo subido no es un PDF")
    key = _pdf_key(presupuesto)
    get_storage().put(key, pdf, "application/pdf")
    presupuesto.numero_gbp = numero_gbp.strip() or None
    presupuesto.pdf_key = key
    presupuesto.estado_carga = EstadoCargaGbp.cargado.value
    presupuesto.cargado_en = datetime.now(timezone.utc)
    presupuesto.error_mensaje = None
    db.commit()
    db.refresh(presupuesto)
    logger.info("GBP bot: presupuesto %s cargado (GBP %s)", presupuesto_id, numero_gbp)
    return presupuesto


def registrar_error(db: Session, presupuesto_id: int, mensaje: str) -> PresupuestoGbp:
    presupuesto = obtener(db, presupuesto_id)
    presupuesto.estado_carga = EstadoCargaGbp.error.value
    presupuesto.error_mensaje = mensaje[:2000]
    db.commit()
    db.refresh(presupuesto)
    logger.warning("GBP bot: presupuesto %s con error: %s", presupuesto_id, mensaje[:200])
    return presupuesto
