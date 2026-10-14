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


@dataclass
class DocumentPart:
    """Documento adjunto (PDF) para pasar a la IA multimodal tal cual: Gemini lo
    lee de forma nativa (texto y tablas). Las planillas (Excel/CSV) NO van por
    acá: se convierten a texto y se anexan al cuerpo del mail."""

    data: bytes
    mime_type: str
    filename: str | None = None


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


class CampoFormulario(BaseModel):
    """Un campo del formulario y el valor que la IA propone (del perfil)."""

    etiqueta: str
    valor: str = ""
    # True si el valor salió del perfil; False si el form lo pide pero no estaba.
    encontrado: bool = True
    # Nombre interno del campo en el PDF (solo en PDFs rellenables/AcroForm); se
    # usa para escribir el valor en el campo correcto al descargar. Vacío si plano.
    campo: str = ""


class FormularioCompletado(BaseModel):
    """Resultado de completar un formulario con el perfil de empresa."""

    campos: list[CampoFormulario] = []
    notas: str | None = None
    # True si el PDF es rellenable (AcroForm) y por lo tanto se puede descargar el
    # formulario original ya completo; False si es plano (necesita plantilla).
    rellenable: bool = False


class PosicionCampo(BaseModel):
    """Dónde escribir un dato en un PDF plano (fracciones 0..1 desde arriba-izq)."""

    etiqueta: str
    page: int = 0
    x: float = 0.0
    y: float = 0.0


class Ubicaciones(BaseModel):
    posiciones: list[PosicionCampo] = []


class AIProvider(ABC):
    """Contrato que toda implementación de IA debe cumplir."""

    @abstractmethod
    def extract_email_data(
        self,
        email_text: str,
        images: list["ImagePart"] | None = None,
        documents: list["DocumentPart"] | None = None,
    ) -> EmailData:
        """Extrae datos estructurados de un mail (texto + imágenes + PDFs)."""

    @abstractmethod
    def draft_quote(self, compras_response: str) -> QuoteDraft:
        """Parsea la tabla de la respuesta de Compras en items de presupuesto."""

    @abstractmethod
    def summarize_thread(self, messages: list[str]) -> str:
        """Resume un hilo de mails."""

    def completar_formulario(
        self, perfil: dict, document: "DocumentPart"
    ) -> "FormularioCompletado":
        """Lee el PDF de un formulario y propone qué valor va en cada campo según
        el perfil de empresa. No es abstracto para no obligar a todos los
        proveedores a implementarlo; Gemini lo soporta."""
        raise NotImplementedError("Este proveedor de IA no soporta completar formularios.")

    def mapear_acroform(
        self, perfil: dict, campos_pdf: list[dict]
    ) -> "FormularioCompletado":
        """Mapea los campos reales de un PDF rellenable (AcroForm) a valores del
        perfil. `campos_pdf` = [{"name", "label"}]. Devuelve cada campo con su
        `campo` (nombre interno) para poder escribirlo después."""
        raise NotImplementedError("Este proveedor de IA no soporta mapear formularios.")

    def ubicar_campos(
        self, etiquetas: list[str], document: "DocumentPart"
    ) -> "Ubicaciones":
        """Con visión: para cada etiqueta, dice en qué página y posición (x,y en
        0..1) habría que escribir el valor en un PDF plano. Es una ayuda que el
        usuario después corrige en el editor."""
        raise NotImplementedError("Este proveedor de IA no soporta ubicar campos.")
