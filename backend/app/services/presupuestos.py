"""Lógica de negocio de presupuestos: código, totales y render del PDF.

El PDF se arma con weasyprint (HTML -> PDF, ya en el stack). El armado de los
ítems y los totales es una función pura para poder testearlo sin generar PDF.
"""

from __future__ import annotations

import base64
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
            iva=Decimal(it.iva) if it.iva is not None else None,
            sku=it.sku,
            fabricante=it.fabricante,
            observaciones=it.observaciones,
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
            iva=Decimal(str(it.iva)) if it.iva is not None else None,
            sku=it.sku,
            fabricante=it.fabricante,
            observaciones=it.observaciones,
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

    # Seguimiento: sincronizar la oportunidad con el estado del presupuesto.
    op = presupuesto.oportunidad
    if op is not None:
        estado = presupuesto.estado
        # Al marcar "enviado": registrar cuándo se cotizó al cliente.
        if estado == EstadoPresupuesto.enviado and op.fecha_enviado_cliente is None:
            op.fecha_enviado_cliente = now_utc().date()
        # Respuesta del cliente (se marca a mano): registrar fecha y mover la
        # oportunidad. No pisamos el estado de post-venta (facturada).
        respuestas = (
            EstadoPresupuesto.aceptado,
            EstadoPresupuesto.rechazado,
            EstadoPresupuesto.negociando,
        )
        if estado in respuestas:
            if presupuesto.fecha_respuesta_cliente is None:
                presupuesto.fecha_respuesta_cliente = now_utc()
            post_venta = (EstadoOportunidad.facturada,)
            if op.estado not in post_venta:
                if estado == EstadoPresupuesto.aceptado:
                    op.estado = EstadoOportunidad.ganada
                elif estado == EstadoPresupuesto.rechazado:
                    op.estado = EstadoOportunidad.perdida
            op.fecha_ultimo_movimiento = now_utc()

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


_LOGO_PATH = Path(__file__).resolve().parent.parent / "assets" / "logo.png"


def _logo_data_uri() -> str | None:
    """Logo de la empresa como data URI (para embeberlo en el PDF)."""
    try:
        data = _LOGO_PATH.read_bytes()
    except OSError:
        return None
    return f"data:image/png;base64,{base64.b64encode(data).decode()}"


def _fmt_forma_pago(valor: str | None) -> str | None:
    """'30' -> '30 días'; 'Transferencia' -> 'Transferencia'."""
    if not valor:
        return None
    v = valor.strip()
    return f"{v} días" if v.isdigit() else v


def _render_html(presupuesto: Presupuesto) -> str:
    op = presupuesto.oportunidad
    cli = op.cliente if op else None
    vend = op.vendedor if op else None
    contacto = op.contacto if op else None
    moneda = presupuesto.moneda or "USD"

    esc = html.escape
    empresa = esc(settings.EMPRESA_NOMBRE)
    logo = _logo_data_uri()
    logo_html = f"<img class='logo' src='{logo}' alt='logo'/>" if logo else ""

    # "13175-LACAU Y CIA. S.A." (número de cliente + razón social).
    if cli and cli.numero_cliente:
        cliente_nombre = f"{cli.numero_cliente}-{cli.razon_social}"
    else:
        cliente_nombre = cli.razon_social if cli else "—"

    filas = "".join(
        f"<tr>"
        f"<td>{esc(it.sku or '')}</td>"
        f"<td>{esc(it.descripcion)}</td>"
        f"<td class='num'>{_q(it.cantidad):g}</td>"
        f"<td class='num'>{_q(it.descuento_pct):g}%</td>"
        f"<td class='num'>{_fmt_money(it.precio_unitario, moneda)}</td>"
        f"<td class='num'>{(f'{_q(it.iva):g}%' if it.iva is not None else '')}</td>"
        f"<td class='num'>{_fmt_money(it.subtotal, moneda)}</td>"
        f"</tr>"
        for it in presupuesto.items
    )

    # Totales: el neto (suma de subtotales) + el IVA calculado por línea.
    neto = _q(presupuesto.monto_total or 0)
    iva_total = Decimal(0)
    for it in presupuesto.items:
        if it.iva:
            iva_total += _q(it.subtotal) * (_q(it.iva) / Decimal(100))
    iva_total = _q(iva_total)
    total = _q(neto + iva_total)

    def fila_dato(label: str, valor: str | None) -> str:
        return (
            f"<tr><td class='lbl'>{esc(label)}</td>"
            f"<td>{esc(valor or '')}</td></tr>"
        )

    izq = "".join(
        [
            fila_dato("Cliente", cliente_nombre),
            fila_dato("Dirección", cli.direccion_facturacion if cli else None),
            fila_dato("Teléfono", cli.telefono if cli else None),
            fila_dato("C.U.I.T", cli.cuit if cli else None),
            fila_dato("Forma de Pago", _fmt_forma_pago(presupuesto.condicion_pago)),
        ]
    )
    derecha = "".join(
        [
            fila_dato("Fecha", now_utc().strftime("%d/%m/%Y")),
            fila_dato("Vendedor", vend.nombre if vend else None),
            fila_dato("e-mail", contacto.email if contacto else None),
            fila_dato("Plazo de entrega", presupuesto.plazo_entrega),
            fila_dato("Validez", presupuesto.validez),
        ]
    )

    obs = [it.observaciones for it in presupuesto.items if it.observaciones]
    obs_html = (
        "".join(f"<p>{esc(o)}</p>" for o in obs)
        if obs
        else "<p class='muted'>—</p>"
    )

    sub_partes = [
        settings.EMPRESA_DIRECCION,
        settings.EMPRESA_TELEFONO,
        settings.EMPRESA_CUIT,
    ]
    sub_line = esc(" · ".join(v for v in sub_partes if v))

    return f"""<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><style>
  @page {{ size: A4; margin: 1.4cm; }}
  body {{ font-family: Helvetica, Arial, sans-serif; color: #111827; font-size: 11px; }}
  .top {{ display: flex; justify-content: space-between; align-items: flex-start;
          border-bottom: 2px solid #111827; padding-bottom: 8px; }}
  .top h1 {{ margin: 0; font-size: 18px; }}
  .top .sub {{ color: #4b5563; font-size: 10px; margin-top: 3px; line-height: 1.5; }}
  .top .right {{ text-align: right; }}
  .top .logo {{ height: 32px; margin-bottom: 4px; }}
  .aviso {{ font-weight: bold; font-size: 10px; }}
  .prep {{ color: #374151; font-weight: bold; font-size: 12px; margin-top: 4px; }}
  .titulo {{ display: flex; justify-content: space-between; align-items: baseline;
             margin: 12px 0 8px; }}
  .titulo .cod {{ font-size: 15px; font-weight: bold; }}
  .datos {{ width: 100%; border-collapse: collapse; margin-bottom: 10px; }}
  .datos td {{ vertical-align: top; padding: 0; }}
  .datos .col {{ width: 50%; }}
  .datos table {{ width: 100%; border-collapse: collapse; }}
  .datos .lbl {{ font-weight: bold; width: 42%; padding: 1px 6px 1px 0; }}
  .datos td td {{ padding: 1px 0; }}
  table.items {{ width: 100%; border-collapse: collapse; margin-top: 4px; }}
  table.items th {{ background: #e5e7eb; color: #111827; text-align: left;
                    padding: 5px 6px; font-size: 10px; border-bottom: 1px solid #9ca3af; }}
  table.items td {{ padding: 5px 6px; border-bottom: 1px solid #e5e7eb; }}
  table.items .num {{ text-align: right; }}
  .resumen {{ width: 42%; margin-left: auto; margin-top: 10px; border-collapse: collapse; }}
  .resumen td {{ padding: 3px 6px; }}
  .resumen .lbl {{ font-weight: bold; }}
  .resumen .num {{ text-align: right; }}
  .resumen .tot td {{ border-top: 1.5px solid #111827; font-size: 13px; font-weight: bold; }}
  .barra {{ background: #e5e7eb; font-weight: bold; padding: 4px 6px; margin: 16px 0 6px; }}
  .firmas {{ margin-top: 24px; color: #374151; line-height: 2.2; }}
  .muted {{ color: #9ca3af; }}
  .foot {{ margin-top: 28px; color: #9ca3af; font-size: 9px; text-align: center; }}
</style></head><body>
  <div class="top">
    <div>
      <h1>{empresa}</h1>
      <div class="sub">{sub_line}</div>
    </div>
    <div class="right">
      {logo_html}
      <div class="aviso">Documento no válido como Factura</div>
      <div class="prep">EN PREPARACIÓN</div>
    </div>
  </div>

  <div class="titulo">
    <span class="cod">Presupuesto&nbsp;&nbsp;# {esc(presupuesto.codigo)}</span>
    <span>Documento a Emitir: Presupuesto {esc(moneda)}</span>
  </div>

  <table class="datos"><tr>
    <td class="col"><table>{izq}</table></td>
    <td class="col"><table>{derecha}</table></td>
  </tr></table>

  <table class="items">
    <thead><tr>
      <th>Código</th><th>Descripción</th>
      <th class="num">Cantidad</th><th class="num">Descuento</th>
      <th class="num">Precio</th><th class="num">IVA</th>
      <th class="num">Subtotal</th>
    </tr></thead>
    <tbody>{filas or '<tr><td colspan="7">Sin ítems.</td></tr>'}</tbody>
  </table>

  <table class="resumen">
    <tr><td class="lbl">SubTotal</td><td class="num">{_fmt_money(neto, moneda)}</td></tr>
    <tr><td class="lbl">IVA</td><td class="num">{_fmt_money(iva_total, moneda)}</td></tr>
    <tr class="tot"><td>Total</td><td class="num">{_fmt_money(total, moneda)}</td></tr>
  </table>

  <div class="barra">Observaciones</div>
  {obs_html}

  <div class="firmas">
    Preparó: ...................................&nbsp;&nbsp;&nbsp;Fecha: ...................<br/>
    Autorizó: ..................................&nbsp;&nbsp;&nbsp;Fecha: ...................<br/>
    Cantidad de Bultos: ...................
  </div>

  <div class="foot">Impreso el {now_utc().strftime('%d/%m/%Y')} &middot; {empresa}</div>
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
