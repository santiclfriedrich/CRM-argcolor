"""Abstract AI provider.

La lógica de negocio depende SOLO de esta interfaz. Cambiar de Gemini a Claude u
Ollama debe ser únicamente cambiar la variable de entorno AI_PROVIDER.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Literal

from pydantic import BaseModel

# Clasificación del mail entrante. Solo "consulta_comercial" genera oportunidad
# y habilita respuesta automática; el resto se registra pero se descarta.
CategoriaMail = Literal[
    "consulta_comercial", "posventa", "orden_compra", "administrativo", "otro"
]


@dataclass
class ImagePart:
    """Imagen adjunta de un mail, para pasar a la IA multimodal."""

    data: bytes
    mime_type: str


class EmailData(BaseModel):
    """Datos estructurados extraídos de un mail entrante."""

    categoria: CategoriaMail = "consulta_comercial"
    cliente_sugerido: str | None = None
    producto: str | None = None
    cantidad: str | None = None
    requerimiento: str | None = None
    plazo: str | None = None
    requiere_aclaracion: bool = False
    borrador_aclaracion: str | None = None


class QuoteItem(BaseModel):
    fabricante: str | None = None
    sku: str | None = None
    descripcion: str
    cantidad: float = 1
    precio_unitario: float = 0
    iva: float | None = None
    observaciones: str | None = None


class QuoteDraft(BaseModel):
    """Borrador de presupuesto generado a partir de la respuesta de Compras."""

    items: list[QuoteItem] = []
    notas: str | None = None


class AIProvider(ABC):
    """Contrato que toda implementación de IA debe cumplir."""

    @abstractmethod
    def extract_email_data(
        self, email_text: str, images: list["ImagePart"] | None = None
    ) -> EmailData:
        """Extrae datos estructurados de un mail (texto + imágenes opcionales)."""

    @abstractmethod
    def draft_quote(self, compras_response: str) -> QuoteDraft:
        """Parsea la tabla de la respuesta de Compras en items de presupuesto."""

    @abstractmethod
    def summarize_thread(self, messages: list[str]) -> str:
        """Resume un hilo de mails."""
