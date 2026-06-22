"""Gemini implementation of AIProvider (Google AI Studio, free tier).

NOTA: este es el scaffolding. Los prompts y el parsing real se completan en Fase 2.
Por ahora las llamadas levantan NotImplementedError de forma controlada para que
la app arranque sin la API key configurada.
"""

import google.generativeai as genai

from app.config import settings
from app.integrations.ai.base import AIProvider, EmailData, QuoteDraft


class GeminiProvider(AIProvider):
    def __init__(self) -> None:
        if settings.GEMINI_API_KEY:
            genai.configure(api_key=settings.GEMINI_API_KEY)
        self._model_name = settings.GEMINI_MODEL

    def extract_email_data(
        self, email_text: str, image_paths: list[str] | None = None
    ) -> EmailData:
        # TODO(Fase 2): prompt multimodal + parsing JSON estructurado.
        raise NotImplementedError("extract_email_data se implementa en Fase 2")

    def draft_quote(self, compras_response: str) -> QuoteDraft:
        # TODO(Fase 3): prompt para parsear tabla Fabricante/SKU/Desc/Cant/Precio/IVA/Obs.
        raise NotImplementedError("draft_quote se implementa en Fase 3")

    def summarize_thread(self, messages: list[str]) -> str:
        # TODO(Fase 2): resumen de hilo.
        raise NotImplementedError("summarize_thread se implementa en Fase 2")
