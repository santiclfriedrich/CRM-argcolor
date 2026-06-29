"""Gemini implementation of AIProvider (Google AI Studio, free tier).

Usa el SDK oficial vigente `google-genai`. La extracción devuelve JSON
estructurado validado contra los schemas Pydantic de `base.py`.
"""

import mimetypes
from pathlib import Path

from google import genai
from google.genai import types

from app.config import settings
from app.integrations.ai.base import AIProvider, EmailData, QuoteDraft

_EXTRACT_SYSTEM = """\
Sos un asistente del equipo comercial de una empresa industrial argentina.
Recibís un mail de un cliente (texto y, opcionalmente, imágenes de etiquetas,
muestras o piezas) y extraés los datos del pedido a cotizar.

Reglas:
- Respondé SIEMPRE en español.
- Si el mail no especifica el producto, la cantidad o algún dato crítico para
  cotizar, marcá requiere_aclaracion=true y redactá en borrador_aclaracion un
  mail breve y cordial pidiendo al cliente los datos faltantes.
- Si hay imágenes, describí en 'producto'/'requerimiento' lo que se ve
  (colores, códigos, números de pieza) además del texto.
- No inventes datos: dejá los campos en null si no están en el mail.
"""

_SUMMARY_SYSTEM = "Resumí el siguiente hilo de mails en español, en 3-5 líneas accionables."


class GeminiProvider(AIProvider):
    def __init__(self) -> None:
        if not settings.GEMINI_API_KEY:
            raise RuntimeError(
                "GEMINI_API_KEY no configurada. Cargala en backend/.env para usar la IA."
            )
        self._client = genai.Client(api_key=settings.GEMINI_API_KEY)
        self._model = settings.GEMINI_MODEL

    def _image_parts(self, image_paths: list[str] | None) -> list[types.Part]:
        parts: list[types.Part] = []
        for path in image_paths or []:
            data = Path(path).read_bytes()
            mime = mimetypes.guess_type(path)[0] or "image/jpeg"
            parts.append(types.Part.from_bytes(data=data, mime_type=mime))
        return parts

    def extract_email_data(
        self, email_text: str, image_paths: list[str] | None = None
    ) -> EmailData:
        contents: list[object] = [email_text, *self._image_parts(image_paths)]
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
        # TODO(Fase 4): prompt para parsear tabla Fabricante/SKU/Desc/Cant/Precio/IVA/Obs.
        raise NotImplementedError("draft_quote se implementa en Fase 4")

    def summarize_thread(self, messages: list[str]) -> str:
        response = self._client.models.generate_content(
            model=self._model,
            contents="\n\n---\n\n".join(messages),
            config=types.GenerateContentConfig(system_instruction=_SUMMARY_SYSTEM),
        )
        return response.text or ""
