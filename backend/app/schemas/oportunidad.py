"""Pydantic schemas for Oportunidad."""

from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, field_validator

from app.db.models.oportunidades import EstadoOportunidad


class OportunidadBase(BaseModel):
    cliente_id: int | None = None
    contacto_cliente_id: int | None = None
    vendedor_id: int | None = None
    estado: EstadoOportunidad = EstadoOportunidad.nueva
    fuente: str | None = None
    # Seguimiento
    asunto: str | None = None
    requerimiento: str | None = None
    producto: str | None = None
    numero_pedido: str | None = None
    ing: str | None = None
    observacion: str | None = None
    cargada_en_gbp: bool = False
    valor_estimado: Decimal | None = None
    fecha_pedido_cliente: date | None = None
    fecha_enviado_compras: date | None = None
    fecha_respuesta_compras: date | None = None
    fecha_enviado_cliente: date | None = None
    fecha_limite: date | None = None


class OportunidadCreate(OportunidadBase):
    pass


class OportunidadUpdate(BaseModel):
    cliente_id: int | None = None
    contacto_cliente_id: int | None = None
    vendedor_id: int | None = None
    estado: EstadoOportunidad | None = None
    fuente: str | None = None
    asunto: str | None = None
    requerimiento: str | None = None
    producto: str | None = None
    numero_pedido: str | None = None
    ing: str | None = None
    observacion: str | None = None
    cargada_en_gbp: bool | None = None
    valor_estimado: Decimal | None = None
    fecha_pedido_cliente: date | None = None
    fecha_enviado_compras: date | None = None
    fecha_respuesta_compras: date | None = None
    fecha_enviado_cliente: date | None = None
    fecha_limite: date | None = None


class ComentarioRead(BaseModel):
    fecha: str
    texto: str
    autor: str | None = None


class ComentarioCreate(BaseModel):
    texto: str


# Mini-objetos anidados para mostrar nombres en el listado sin un segundo fetch.
class ClienteMini(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    razon_social: str
    numero_cliente: str | None = None


class ContactoMini(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nombre: str


class VendedorMini(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nombre: str


class OportunidadRead(OportunidadBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    fecha_creacion: datetime
    fecha_ultimo_movimiento: datetime
    fecha_cierre: datetime | None = None
    archivos_adjuntos: list[dict] | None = None
    comentarios: list[ComentarioRead] = []
    cliente: ClienteMini | None = None
    contacto: ContactoMini | None = None
    vendedor: VendedorMini | None = None
    creado_por: VendedorMini | None = None
    transferencia_para: VendedorMini | None = None  # destinatario pendiente de aceptar

    @field_validator("comentarios", mode="before")
    @classmethod
    def _comentarios_none_a_lista(cls, v: object) -> object:
        return v or []


class OportunidadListItem(BaseModel):
    """Fila del listado de oportunidades: solo lo que muestran las tablas.

    Deja afuera lo que solo usa el detalle (que tiene su propio fetch): el texto
    largo del `requerimiento`, la bitácora de `comentarios`, los
    `archivos_adjuntos` (JSON) y los joins de contacto/creado_por/transferencia.
    El `requerimiento` NO se pierde: sigue en la DB y lo leen el detalle y el
    flujo de "Pedir a compras" directamente de la base."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    estado: EstadoOportunidad
    cliente_id: int | None = None
    vendedor_id: int | None = None
    asunto: str | None = None
    producto: str | None = None
    numero_pedido: str | None = None
    ing: str | None = None
    observacion: str | None = None
    cargada_en_gbp: bool = False
    valor_estimado: Decimal | None = None
    fecha_pedido_cliente: date | None = None
    fecha_enviado_compras: date | None = None
    fecha_respuesta_compras: date | None = None
    fecha_enviado_cliente: date | None = None
    fecha_limite: date | None = None
    fecha_creacion: datetime
    fecha_ultimo_movimiento: datetime
    fecha_cierre: datetime | None = None
    cliente: ClienteMini | None = None
    vendedor: VendedorMini | None = None
