"""Lógica de negocio de solicitudes a Compras: armado del mail borrador.

El envío real por Gmail llega en Fase 2. Por ahora generamos el texto con el
mismo formato que el Google Form actual para que el vendedor lo copie/envíe.
"""

from sqlalchemy.orm import Session

from app.db.models.configuracion import Configuracion
from app.db.models.solicitudes_compras import SolicitudCompras

# Clave en la tabla `configuracion` con destinatarios por defecto:
#   {"to": "carlos@...", "cc": ["marcos@...", "karen@...", "diego@..."]}
CONFIG_KEY = "solicitudes_compras"


def _default_recipients(db: Session) -> tuple[str | None, list[str]]:
    cfg = db.get(Configuracion, CONFIG_KEY)
    valor = cfg.valor if cfg and cfg.valor else {}
    to = valor.get("to")
    cc = list(valor.get("cc", []))
    return to, cc


def _fmt(value: object | None) -> str:
    return str(value) if value not in (None, "") else "—"


def build_email_preview(solicitud: SolicitudCompras, db: Session) -> dict:
    """Construye {to, cc, subject, body} del mail a Compras."""
    to, cc_default = _default_recipients(db)
    cc = [*cc_default, *(solicitud.ccs_extra or [])]

    op = solicitud.oportunidad
    cliente = op.cliente.razon_social if op and op.cliente else "Sin cliente"
    vendedor = solicitud.solicitante.nombre if solicitud.solicitante else "—"

    # Patrón de asunto que luego usa la IA para linkear la respuesta de Compras.
    subject = f"Solicitud {vendedor}: {cliente} - ID {solicitud.oportunidad_id}"

    importe = (
        f"USD {solicitud.importe_aproximado:,.2f}"
        if solicitud.importe_aproximado is not None
        else "—"
    )
    condicion = solicitud.condicion_pago.value if solicitud.condicion_pago else "—"

    body = "\n".join(
        [
            "Hola,",
            "",
            "Solicito cotización para el siguiente requerimiento:",
            "",
            f"Solicitante: {vendedor}",
            f"Cliente: {cliente}",
            "",
            "Requerimiento:",
            solicitud.requerimiento,
            "",
            f"Condición de pago: {condicion}",
            f"Importe aproximado: {importe}",
            f"Fecha límite: {_fmt(solicitud.fecha_limite)}",
            f"Referencia GBP: {_fmt(solicitud.presupuesto_gbp_referencia)}",
            "",
            "Gracias.",
        ]
    )

    return {"to": to, "cc": cc, "subject": subject, "body": body}
