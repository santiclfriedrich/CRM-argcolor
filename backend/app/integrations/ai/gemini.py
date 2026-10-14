"""Gemini implementation of AIProvider (Google AI Studio, free tier).

Usa el SDK oficial vigente `google-genai`. La extracción devuelve JSON
estructurado validado contra los schemas Pydantic de `base.py`.
"""

import json

from google import genai
from google.genai import types

from app.config import settings
from app.integrations.ai.base import (
    AIProvider,
    DocumentPart,
    EmailData,
    FormularioCompletado,
    ImagePart,
    QuoteDraft,
    Ubicaciones,
)

_EXTRACT_SYSTEM = """\
Sos un asistente del equipo comercial de una empresa industrial argentina.
Recibís un mail de un cliente (texto y, opcionalmente, imágenes de etiquetas,
muestras o piezas, y/o adjuntos como planillas Excel/CSV o PDF) y extraés los
datos del pedido a cotizar.

IMPORTANTE sobre adjuntos: en los pedidos de cotización (RFQ) es muy común que
el cuerpo del mail solo diga "cotizar los ítems de la planilla/archivo adjunto"
y que el detalle real (productos, códigos, cantidades) esté en el PDF o en la
planilla. Si viene el contenido de una planilla anexado al texto (bajo un título
"--- Planilla adjunta: … ---") o un PDF adjunto, LEELO y extraé de ahí el
producto/cantidad/requerimiento. En ese caso NO marques requiere_aclaracion solo
porque el cuerpo esté vacío: los datos están en el adjunto.

Primero clasificá el mail en 'categoria':
- "consulta_comercial": el cliente pide, solicita o consulta por productos,
  precios, stock o disponibilidad para una compra NUEVA; o pide cotizar/comprar.
  Aunque el pedido sea vago o no diga el producto exacto (ej. "solicitud de
  productos"), ES consulta comercial: en ese caso marcá requiere_aclaracion=true.
  SOLO esta categoría genera una oportunidad.
- "posventa": reclamos, quejas, garantías, devoluciones, cambios o soporte
  técnico sobre un producto YA COMPRADO o entregado. Señales típicas: "compré",
  "ya apliqué", "no funciona", "vino fallado", "se descascaró", "reclamo",
  "garantía", "RMA", "devolución", "nota de crédito", o un asunto tipo
  "Re: Reclamo". Aunque nombre un producto, marca, código o cantidad, NO es una
  compra nueva: NO genera oportunidad. IMPORTANTE: si el hilo es un reclamo/RMA
  y en el último mensaje piden "una alternativa", "un reemplazo" o "algo
  similar", SIGUE siendo posventa (es la resolución del reclamo), NO comercial.
- "orden_compra": el cliente envía o confirma una orden de compra YA cerrada
  (adjunta una OC, da un número de OC), o da instrucciones de facturación/recepción.
- "administrativo": facturación, pagos, cobranzas, remitos, datos fiscales o
  avisos administrativos. Señales típicas (aunque mencionen productos o montos):
  "factura", "proforma", "remito", "comprobante", "recibo", "nota de crédito",
  "nota de débito", "CAE", "AFIP", "ARCA", "aviso de pago", "orden de pago",
  "cobranza", "resumen de cuenta", "estado de cuenta", "retención", "constancia".
  También los mails AUTOMÁTICOS o masivos: remitentes tipo
  no-reply/noreply/facturacion@/administracion@, boletines.
- "otro": newsletters, spam, o mensajes sin relación con una venta a un cliente.
  TAMBIÉN va acá el ABASTECIMIENTO/COMPRAS de Argentina Color. Lo que define una
  consulta_comercial es la DIRECCIÓN: el CLIENTE nos PIDE a NOSOTROS que le
  vendamos/coticemos. NO es consulta_comercial (va en "otro") cuando pasa lo
  contrario, es decir cuando NOSOTROS somos el comprador:
    a) un PROVEEDOR responde a un pedido de precio/stock que hizo alguien de
       @argentinacolor.com (el hilo lo inició alguien nuestro pidiéndole a un
       tercero), o
    b) un PROVEEDOR nos OFRECE/propone venderNOS productos por iniciativa propia
       (catálogo, lista de precios, condiciones de pago/entrega que ELLOS ofrecen,
       "ofrecemos", "disponemos de", "cotización de nuestros productos"), sin que
       haya un cliente pidiéndonos algo.
  En resumen: si el remitente nos está VENDIENDO u OFRECIENDO a nosotros, es
  abastecimiento -> "otro", no una oportunidad.

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

_FORM_SYSTEM = """\
Sos un asistente que completa formularios de alta de proveedor / licitación de
una empresa argentina. Te doy (1) el PERFIL de la empresa en JSON y (2) el PDF de
un formulario a completar.

Identificá TODOS los campos que hay que completar en el formulario —incluidas las
opciones o casilleros a marcar (condición ante el IVA, IIBB, Ganancias, conceptos
sujetos a retención, etc.)— y devolvé, para cada uno:
- etiqueta: el nombre del campo tal como figura en el formulario.
- valor: el dato que corresponde SEGÚN EL PERFIL. Para opciones/casilleros, poné
  la opción que hay que marcar (ej. "Responsable Inscripto").
- encontrado: true si el valor salió del perfil; false si el formulario lo pide
  pero el dato NO está en el perfil (en ese caso dejá valor = "").

Reglas:
- Respondé SIEMPRE en español.
- NO inventes datos: si no está en el perfil, encontrado=false y valor "".
- No completes la firma ni la fecha (los pone la persona a mano).
- En 'notas' aclaraciones generales (ej. qué certificados adjuntar) si las hay."""

_ACROFORM_SYSTEM = """\
Sos un asistente que completa formularios de alta de proveedor / licitación de
una empresa argentina. Te doy (1) el PERFIL de la empresa en JSON y (2) la LISTA
de campos de un PDF rellenable, cada uno con su nombre interno ('name') y su
etiqueta visible ('label').

Para CADA campo de la lista devolvé un objeto con:
- campo: el 'name' interno EXACTO, tal cual te lo paso (no lo cambies).
- etiqueta: la 'label' visible (o el name si no hay label).
- valor: el dato que corresponde SEGÚN EL PERFIL. Si no está en el perfil, "".
- encontrado: true si el valor salió del perfil; false si no.

Reglas: respondé SIEMPRE en español. NO inventes datos. No completes firma ni
fecha. Devolvé un campo por cada uno de la lista, en el mismo orden."""

_UBICAR_SYSTEM = """\
Te doy un PDF de un formulario (plano) y una lista de ETIQUETAS de datos a
completar. Para CADA etiqueta, indicá dónde habría que ESCRIBIR el valor: la
página (empezando en 0) y la posición (x, y) en FRACCIONES de 0 a 1 medidas desde
la esquina SUPERIOR IZQUIERDA de esa página.

Importante: la posición es la del ESPACIO EN BLANCO donde va el dato (al lado o
debajo de la etiqueta impresa en el formulario), NO la de la etiqueta misma. Para
casilleros, la posición del casillero a marcar.

Devolvé una posición por cada etiqueta de la lista. Respondé en español."""

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

    def _document_parts(self, documents: list[DocumentPart] | None) -> list[types.Part]:
        return [
            types.Part.from_bytes(data=doc.data, mime_type=doc.mime_type)
            for doc in (documents or [])
        ]

    def extract_email_data(
        self,
        email_text: str,
        images: list[ImagePart] | None = None,
        documents: list[DocumentPart] | None = None,
    ) -> EmailData:
        contents: list[object] = [
            email_text,
            *self._image_parts(images),
            *self._document_parts(documents),
        ]
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

    def completar_formulario(
        self, perfil: dict, document: DocumentPart
    ) -> FormularioCompletado:
        contents: list[object] = [
            "PERFIL DE LA EMPRESA (JSON):\n"
            + json.dumps(perfil, ensure_ascii=False, indent=2),
            *self._document_parts([document]),
        ]
        response = self._client.models.generate_content(
            model=self._model,
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=_FORM_SYSTEM,
                response_mime_type="application/json",
                response_schema=FormularioCompletado,
            ),
        )
        parsed = response.parsed
        if isinstance(parsed, FormularioCompletado):
            return parsed
        return FormularioCompletado.model_validate_json(response.text or "{}")

    def ubicar_campos(
        self, etiquetas: list[str], document: DocumentPart
    ) -> Ubicaciones:
        contents: list[object] = [
            "ETIQUETAS A UBICAR (JSON):\n"
            + json.dumps(etiquetas, ensure_ascii=False),
            *self._document_parts([document]),
        ]
        response = self._client.models.generate_content(
            model=self._model,
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=_UBICAR_SYSTEM,
                response_mime_type="application/json",
                response_schema=Ubicaciones,
            ),
        )
        parsed = response.parsed
        if isinstance(parsed, Ubicaciones):
            return parsed
        return Ubicaciones.model_validate_json(response.text or "{}")

    def mapear_acroform(
        self, perfil: dict, campos_pdf: list[dict]
    ) -> FormularioCompletado:
        contenido = (
            "PERFIL DE LA EMPRESA (JSON):\n"
            + json.dumps(perfil, ensure_ascii=False, indent=2)
            + "\n\nCAMPOS DEL PDF (JSON):\n"
            + json.dumps(campos_pdf, ensure_ascii=False, indent=2)
        )
        response = self._client.models.generate_content(
            model=self._model,
            contents=contenido,
            config=types.GenerateContentConfig(
                system_instruction=_ACROFORM_SYSTEM,
                response_mime_type="application/json",
                response_schema=FormularioCompletado,
            ),
        )
        parsed = response.parsed
        if isinstance(parsed, FormularioCompletado):
            return parsed
        return FormularioCompletado.model_validate_json(response.text or "{}")
