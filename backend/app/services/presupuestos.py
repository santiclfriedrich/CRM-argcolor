"""Lógica de negocio de presupuestos: código, totales y render del PDF.

El PDF se arma con weasyprint (HTML -> PDF, ya en el stack). El armado de los
ítems y los totales es una función pura para poder testearlo sin generar PDF.
"""

from __future__ import annotations

import html
import os
import platform
from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.db.models.mails import DireccionMail, Mail
from app.db.models.oportunidades import EstadoOportunidad
from app.db.models.presupuesto_items import PresupuestoItem
from app.db.models.presupuestos import EstadoPresupuesto, Presupuesto
from app.db.models.solicitudes_compras import SolicitudCompras
from app.integrations.ai.base import QuoteDraft
from app.schemas.presupuesto import ItemBase, PresupuestoCreate, PresupuestoUpdate


def now_utc() -> datetime:
    return datetime.now(timezone.utc)

_CENTAVOS = Decimal("0.01")


def _q(valor: Decimal) -> Decimal:
    """Redondea a 2 decimales (medio hacia arriba)."""
    return Decimal(valor).quantize(_CENTAVOS, rounding=ROUND_HALF_UP)


def calcular_subtotal(item: PresupuestoItem | ItemBase) -> Decimal:
    """subtotal = cantidad * precio_unitario * (1 - descuento%)."""
    cantidad = Decimal(item.cantidad or 0)
    precio = Decimal(item.precio_unitario or 0)
    desc = Decimal(item.descuento_pct or 0)
    factor = (Decimal(100) - desc) / Decimal(100)
    return _q(cantidad * precio * factor)


def recalcular_totales(presupuesto: Presupuesto) -> None:
    """Recalcula el subtotal de cada ítem y el monto total del presupuesto."""
    total = Decimal(0)
    for item in presupuesto.items:
        item.subtotal = calcular_subtotal(item)
        total += item.subtotal
    presupuesto.monto_total = _q(total)


def generar_codigo(db: Session) -> str:
    """Código correlativo tipo ``P-2026-0001`` (por año)."""
    anio = now_utc().year
    n = (db.scalar(select(func.count()).select_from(Presupuesto)) or 0) + 1
    return f"P-{anio}-{n:04d}"


def _items_desde_schema(items: list[ItemBase]) -> list[PresupuestoItem]:
    creados: list[PresupuestoItem] = []
    for orden, it in enumerate(items):
        item = PresupuestoItem(
            descripcion=it.descripcion,
            cantidad=Decimal(it.cantidad or 0),
            precio_unitario=Decimal(it.precio_unitario or 0),
            descuento_pct=Decimal(it.descuento_pct or 0),
            sku=it.sku,
            fabricante=it.fabricante,
            orden=orden,
        )
        item.subtotal = calcular_subtotal(item)
        creados.append(item)
    return creados


def crear_presupuesto(db: Session, data: PresupuestoCreate) -> Presupuesto:
    """Crea un presupuesto (borrador) con sus ítems y avanza la oportunidad."""
    presupuesto = Presupuesto(
        oportunidad_id=data.oportunidad_id,
        codigo=generar_codigo(db),
        moneda=data.moneda or "USD",
        condicion_pago=data.condicion_pago,
        plazo_entrega=data.plazo_entrega,
        validez=data.validez,
        items=_items_desde_schema(data.items),
    )
    recalcular_totales(presupuesto)
    db.add(presupuesto)

    # Al armar la primera cotización, la oportunidad pasa a "presupuestada".
    op = presupuesto.oportunidad
    if op is None:
        from app.db.models.oportunidades import Oportunidad

        op = db.get(Oportunidad, data.oportunidad_id)
    if op is not None and op.estado not in (
        EstadoOportunidad.ganada,
        EstadoOportunidad.facturada,
        EstadoOportunidad.perdida,
    ):
        op.estado = EstadoOportunidad.presupuestada
        op.fecha_ultimo_movimiento = now_utc()

    db.commit()
    db.refresh(presupuesto)
    return presupuesto


def crear_desde_solicitud(db: Session, solicitud: SolicitudCompras) -> Presupuesto:
    """Arma un presupuesto con los ítems que la IA parseó de la respuesta de Compras.

    Usa la última respuesta cargada de la solicitud. Lanza ValueError si todavía
    no hay una respuesta parseada."""
    respuesta = next(
        (r for r in sorted(solicitud.respuestas, key=lambda r: r.id, reverse=True)
         if r.datos_parseados_ia),
        None,
    )
    if respuesta is None:
        raise ValueError("La solicitud todavía no tiene una respuesta de Compras parseada.")

    draft = QuoteDraft.model_validate(respuesta.datos_parseados_ia)
    items = [
        ItemBase(
            descripcion=it.descripcion,
            cantidad=Decimal(str(it.cantidad or 1)),
            precio_unitario=Decimal(str(it.precio_unitario or 0)),
            sku=it.sku,
            fabricante=it.fabricante,
        )
        for it in draft.items
    ]
    condicion = solicitud.condicion_pago.value if solicitud.condicion_pago else None
    data = PresupuestoCreate(
        oportunidad_id=solicitud.oportunidad_id,
        condicion_pago=condicion,
        items=items,
    )
    return crear_presupuesto(db, data)


def actualizar_presupuesto(
    db: Session, presupuesto: Presupuesto, data: PresupuestoUpdate
) -> Presupuesto:
    """Actualiza cabecera y/o ítems. Si vienen ítems, reemplazan a los actuales."""
    for campo in ("condicion_pago", "plazo_entrega", "validez", "moneda", "estado"):
        valor = getattr(data, campo)
        if valor is not None:
            setattr(presupuesto, campo, valor)

    if data.items is not None:
        for viejo in list(presupuesto.items):
            db.delete(viejo)
        presupuesto.items = _items_desde_schema(data.items)

    # Seguimiento: al marcar el presupuesto como "enviado", registrar en la
    # oportunidad cuándo se cotizó al cliente.
    if (
        presupuesto.estado == EstadoPresupuesto.enviado
        and presupuesto.oportunidad is not None
        and presupuesto.oportunidad.fecha_enviado_cliente is None
    ):
        presupuesto.oportunidad.fecha_enviado_cliente = now_utc().date()

    recalcular_totales(presupuesto)
    # Cualquier cambio invalida el PDF anterior: se regenera al descargar.
    presupuesto.pdf_url = None
    db.commit()
    db.refresh(presupuesto)
    return presupuesto


def _ensure_native_libs() -> None:
    """weasyprint en macOS/Apple Silicon no encuentra las libs de Homebrew;
    agregamos /opt/homebrew/lib al path del loader dinámico antes de importarlo."""
    if platform.system() != "Darwin":
        return
    brew_lib = "/opt/homebrew/lib"
    if os.path.isdir(brew_lib):
        actual = os.environ.get("DYLD_FALLBACK_LIBRARY_PATH", "")
        if brew_lib not in actual.split(":"):
            os.environ["DYLD_FALLBACK_LIBRARY_PATH"] = (
                f"{brew_lib}:{actual}" if actual else brew_lib
            )


def _pdf_path(presupuesto: Presupuesto) -> Path:
    return Path(settings.MEDIA_DIR) / "presupuestos" / f"{presupuesto.codigo}.pdf"


def _fmt_money(valor: Decimal | None, moneda: str) -> str:
    monto = _q(valor or 0)
    entero, dec = f"{monto:.2f}".split(".")
    # Separador de miles con punto (formato AR).
    entero = f"{int(entero):,}".replace(",", ".")
    return f"{moneda} {entero},{dec}"


def _render_html(presupuesto: Presupuesto) -> str:
    op = presupuesto.oportunidad
    cliente = op.cliente.razon_social if op and op.cliente else "—"
    moneda = presupuesto.moneda or "USD"

    filas = "".join(
        f"<tr>"
        f"<td>{html.escape(it.fabricante or '')}</td>"
        f"<td>{html.escape(it.sku or '')}</td>"
        f"<td>{html.escape(it.descripcion)}</td>"
        f"<td class='num'>{_q(it.cantidad):g}</td>"
        f"<td class='num'>{_fmt_money(it.precio_unitario, moneda)}</td>"
        f"<td class='num'>{_q(it.descuento_pct):g}%</td>"
        f"<td class='num'>{_fmt_money(it.subtotal, moneda)}</td>"
        f"</tr>"
        for it in presupuesto.items
    )

    def dato(label: str, valor: str | None) -> str:
        return f"<p><strong>{label}:</strong> {html.escape(valor)}</p>" if valor else ""

    sub_partes = [
        settings.EMPRESA_CUIT,
        settings.EMPRESA_DIRECCION,
        settings.EMPRESA_TELEFONO,
        settings.EMPRESA_EMAIL,
    ]
    sub_line = html.escape(" · ".join(v for v in sub_partes if v))

    return f"""<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><style>
  @page {{ size: A4; margin: 2cm; }}
  body {{ font-family: Helvetica, Arial, sans-serif; color: #1e293b; font-size: 12px; }}
  .header {{ border-bottom: 3px solid #1d4ed8; padding-bottom: 10px; margin-bottom: 18px; }}
  .header h1 {{ color: #1d4ed8; margin: 0; font-size: 22px; }}
  .header .sub {{ color: #64748b; font-size: 11px; margin-top: 2px; }}
  .meta {{ display: flex; justify-content: space-between; margin-bottom: 16px; }}
  .meta .box p {{ margin: 2px 0; }}
  .codigo {{ text-align: right; }}
  .codigo .big {{ font-size: 16px; font-weight: bold; color: #1d4ed8; }}
  table {{ width: 100%; border-collapse: collapse; margin-top: 8px; }}
  th {{ background: #1d4ed8; color: #fff; text-align: left; padding: 6px 8px; font-size: 11px; }}
  td {{ padding: 6px 8px; border-bottom: 1px solid #e2e8f0; }}
  td.num, th.num {{ text-align: right; }}
  .total {{ text-align: right; margin-top: 12px; font-size: 15px; font-weight: bold; }}
  .cond {{ margin-top: 20px; color: #334155; }}
  .foot {{ margin-top: 40px; color: #94a3b8; font-size: 10px; text-align: center; }}
</style></head><body>
  <div class="header">
    <h1>{html.escape(settings.EMPRESA_NOMBRE)}</h1>
    <div class="sub">{sub_line}</div>
  </div>
  <div class="meta">
    <div class="box">
      <p><strong>Cliente:</strong> {html.escape(cliente)}</p>
      <p><strong>Fecha:</strong> {now_utc().strftime('%d/%m/%Y')}</p>
    </div>
    <div class="box codigo">
      <p class="big">PRESUPUESTO {html.escape(presupuesto.codigo)}</p>
      <p>Versión {presupuesto.version}</p>
    </div>
  </div>
  <table>
    <thead><tr>
      <th>Fabricante</th><th>SKU</th><th>Descripción</th>
      <th class="num">Cant.</th><th class="num">P. unit.</th>
      <th class="num">Desc.</th><th class="num">Subtotal</th>
    </tr></thead>
    <tbody>{filas or '<tr><td colspan="7">Sin ítems.</td></tr>'}</tbody>
  </table>
  <p class="total">Total: {_fmt_money(presupuesto.monto_total, moneda)}</p>
  <div class="cond">
    {dato("Condición de pago", presupuesto.condicion_pago)}
    {dato("Plazo de entrega", presupuesto.plazo_entrega)}
    {dato("Validez de la oferta", presupuesto.validez)}
  </div>
  <div class="foot">Documento generado por el CRM de {html.escape(settings.EMPRESA_NOMBRE)}.</div>
</body></html>"""


def _cuerpo_mail(presupuesto: Presupuesto) -> str:
    lineas = [
        "Hola,",
        "",
        f"Te enviamos el presupuesto {presupuesto.codigo} (adjunto en PDF).",
    ]
    extras = []
    if presupuesto.condicion_pago:
        extras.append(f"Condición de pago: {presupuesto.condicion_pago}")
    if presupuesto.plazo_entrega:
        extras.append(f"Plazo de entrega: {presupuesto.plazo_entrega}")
    if presupuesto.validez:
        extras.append(f"Validez: {presupuesto.validez}")
    if extras:
        lineas += ["", *extras]
    lineas += ["", "Quedamos a disposición.", "", "Saludos,", settings.EMPRESA_NOMBRE]
    return "\n".join(lineas)


def enviar_al_cliente(
    db: Session,
    gmail,  # noqa: ANN001 - GmailClient
    presupuesto: Presupuesto,
    to: str,
    mensaje: str | None = None,
    remitente: str | None = None,
) -> Presupuesto:
    """Envía el presupuesto (PDF adjunto) al cliente por Gmail, lo marca como
    enviado y registra el saliente. Lanza ValueError si no hay destinatario."""
    if not to or not to.strip():
        raise ValueError("No hay email del cliente para enviar el presupuesto.")

    ruta = render_pdf(db, presupuesto)  # regenera con los datos actuales
    contenido = ruta.read_bytes()

    asunto = f"Presupuesto {presupuesto.codigo} — {settings.EMPRESA_NOMBRE}"
    cuerpo = mensaje.strip() if mensaje and mensaje.strip() else _cuerpo_mail(presupuesto)

    gmail.send_message(
        to=to.strip(),
        subject=asunto,
        body=cuerpo,
        attachments=[
            {
                "filename": f"{presupuesto.codigo}.pdf",
                "content": contenido,
                "mime": "application/pdf",
            }
        ],
    )

    ahora = now_utc()
    presupuesto.estado = EstadoPresupuesto.enviado
    presupuesto.fecha_envio = ahora
    op = presupuesto.oportunidad
    if op is not None and op.fecha_enviado_cliente is None:
        op.fecha_enviado_cliente = ahora.date()

    # Registrar el saliente para que quede en el historial de la oportunidad.
    db.add(
        Mail(
            oportunidad_id=presupuesto.oportunidad_id,
            direccion=DireccionMail.saliente,
            de=remitente,
            para=to.strip(),
            asunto=asunto,
            cuerpo=cuerpo,
            fecha=ahora,
        )
    )
    db.commit()
    db.refresh(presupuesto)
    return presupuesto


def render_pdf(db: Session, presupuesto: Presupuesto) -> Path:
    """Genera (o regenera) el PDF del presupuesto y devuelve su ruta."""
    _ensure_native_libs()
    try:
        from weasyprint import HTML
    except OSError as exc:  # libs nativas faltantes (pango/cairo)
        raise RuntimeError(
            "No se pudo cargar weasyprint. En macOS instalá las libs con "
            "'brew install pango'."
        ) from exc

    destino = _pdf_path(presupuesto)
    destino.parent.mkdir(parents=True, exist_ok=True)
    HTML(string=_render_html(presupuesto)).write_pdf(str(destino))

    presupuesto.pdf_url = f"/api/v1/presupuestos/{presupuesto.id}/pdf"
    db.commit()
    return destino
