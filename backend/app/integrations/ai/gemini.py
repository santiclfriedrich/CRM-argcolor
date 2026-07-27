"""Gemini implementation of AIProvider (Google AI Studio, free tier).

Usa el SDK oficial vigente `google-genai`. La extracción devuelve JSON
estructurado validado contra los schemas Pydantic de `base.py`.
"""

from google import genai
from google.genai import types

from app.config import settings
from app.integrations.ai.base import (
    AIProvider,
    EmailData,
    ImagePart,
    QuoteDraft,
)

_EXTRACT_SYSTEM = """\
Sos un asistente del equipo comercial de una empresa industrial argentina.
Recibís un mail de un cliente (texto y, opcionalmente, imágenes de etiquetas,
muestras o piezas) y extraés los datos del pedido a cotizar.

Primero clasificá el mail en 'categoria':
- "consulta_comercial": el cliente pide, solicita o consulta por productos,
  precios, stock o disponibilidad para una compra NUEVA; o pide cotizar/comprar.
  Aunque el pedido sea vago o no diga el producto exacto (ej. "solicitud de
  productos"), ES consulta comercial: en ese caso marcá requiere_aclaracion=true.
  SOLO esta categoría genera una oportunidad.
- "posventa": reclamos, quejas, garantías, devoluciones, cambios o soporte
  técnico sobre un producto YA COMPRADO o entregado. Señales típicas: "compré",
  "ya apliqué", "no funciona", "vino fallado", "se descascaró", "reclamo",
  "garantía", "devolución". Aunque nombre un producto, marca, código o cantidad,
  NO es una compra nueva: NO genera oportunidad.
- "orden_compra": el cliente envía o confirma una orden de compra YA cerrada
  (adjunta una OC, da un número de OC), o da instrucciones de facturación/recepción.
- "administrativo": facturación, pagos, cobranzas, remitos, datos fiscales o
  avisos administrativos. Señales típicas (aunque mencionen productos o montos):
  "factura", "comprobante", "recibo", "nota de crédito", "nota de débito", "CAE",
  "AFIP", "ARCA", "aviso de pago", "orden de pago", "cobranza", "resumen de
  cuenta", "retención", "constancia". También los mails AUTOMÁTICOS o masivos:
  remitentes tipo no-reply/noreply/facturacion@/administracion@, boletines.
- "otro": newsletters, spam o mensajes claramente sin relación con una venta.

Regla de oro: ante una duda GENUINA sobre si es un pedido/consulta de compra
NUEVA, elegí "consulta_comercial" (mejor una oportunidad de más que perder un
pedido real). PERO esta regla NO aplica cuando hay señales claras de otra
categoría: si el mail es una factura/comprobante/aviso administrativo, un mail
automático o boletín, o un reclamo/garantía/posventa, clasificalo en su categoría
correspondiente ("administrativo", "otro" o "posventa") AUNQUE mencione productos,
marcas, códigos o cantidades. No conviertas un administrativo o un automático en
oportunidad.

Si la categoría NO es "consulta_comercial", dejá los demás campos en null/false:
no extraigas producto/cantidad ni redactes aclaración.

Reglas (solo para consulta_comercial):
- Respondé SIEMPRE en español.
- Si el mail no especifica el producto, la cantidad o algún dato crítico para
  cotizar, marcá requiere_aclaracion=true y redactá en borrador_aclaracion un
  mail breve y cordial pidiendo al cliente los datos faltantes.
- En borrador_aclaracion NUNCA menciones un producto, marca, código o tipo de
  artículo que el cliente no haya escrito: pedí solo los datos que faltan, sin
  suponer de qué producto se trata.
- Si hay imágenes, describí en 'producto'/'requerimiento' lo que se ve
  (colores, códigos, números de pieza) además del texto.
- No inventes datos: dejá los campos en null si no están en el mail.
"""

_SUMMARY_SYSTEM = "Resumí el siguiente hilo de mails en español, en 3-5 líneas accionables."

_QUOTE_SYSTEM = """\
Sos un asistente del equipo comercial de una empresa industrial argentina.
Recibís la respuesta de Compras a un pedido de cotización: suele venir como una
tabla o lista con los productos y sus precios. Extraé cada ítem cotizado.

Para cada ítem completá lo que puedas:
- fabricante: marca o fabricante, si aparece.
- sku: código de producto/artículo, si aparece.
- descripcion: nombre o detalle del producto (obligatorio).
- cantidad: cantidad cotizada (si no está, 1).
- precio_unitario: precio por unidad, como número (sin símbolos ni miles con
  punto; usá punto decimal). Si el precio viene con IVA incluido o discriminado,
  cargá el neto en precio_unitario y el porcentaje en 'iva' si se aclara.
- iva: porcentaje de IVA si se menciona (ej. 21), si no dejá null.
- observaciones: plazo, stock, condiciones u otras notas del ítem.

Reglas:
- Respondé SIEMPRE en español.
- No inventes datos: si un campo no está, dejalo en null.
- Poné en 'notas' cualquier comentario general de Compras (plazos globales,
  condiciones de pago, aclaraciones) que no sea de un ítem puntual.
"""


class GeminiProvider(AIProvider):
    def __init__(self) -> None:
        if not settings.GEMINI_API_KEY:
            raise RuntimeError(
                "GEMINI_API_KEY no configurada. Cargala en backend/.env para usar la IA."
            )
        self._client = genai.Client(api_key=settings.GEMINI_API_KEY)
        self._model = settings.GEMINI_MODEL

    def _image_parts(self, images: list[ImagePart] | None) -> list[types.Part]:
        return [
            types.Part.from_bytes(data=img.data, mime_type=img.mime_type)
            for img in (images or [])
        ]

    def extract_email_data(
        self, email_text: str, images: list[ImagePart] | None = None
    ) -> EmailData:
        contents: list[object] = [email_text, *self._image_parts(images)]
        response = self._client.models.generate_content(
            model=self._model,
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=_EXTRACT_SYSTEM,
                response_mime_type="application/json",
                response_schema=EmailData,
            ),
        )
        parsed = response.parsed
        if isinstance(parsed, EmailData):
            return parsed
        # Fallback defensivo si el SDK no devolvió el objeto ya parseado.
        return EmailData.model_validate_json(response.text or "{}")

    def draft_quote(self, compras_response: str) -> QuoteDraft:
        response = self._client.models.generate_content(
            model=self._model,
            contents=compras_response,
            config=types.GenerateContentConfig(
                system_instruction=_QUOTE_SYSTEM,
                response_mime_type="application/json",
                response_schema=QuoteDraft,
            ),
        )
        parsed = response.parsed
        if isinstance(parsed, QuoteDraft):
            return parsed
        return QuoteDraft.model_validate_json(response.text or "{}")

    def summarize_thread(self, messages: list[str]) -> str:
        response = self._client.models.generate_content(
            model=self._model,
            contents="\n\n---\n\n".join(messages),
            config=types.GenerateContentConfig(system_instruction=_SUMMARY_SYSTEM),
        )
        return response.text or ""
