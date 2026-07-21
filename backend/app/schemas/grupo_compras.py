"""Pydantic schemas para los grupos de destinatarios de Compras (por usuario)."""

from pydantic import BaseModel, ConfigDict, EmailStr


class GrupoComprasBase(BaseModel):
    nombre: str
    to: EmailStr
    cc: list[EmailStr] = []
    es_default: bool = False


class GrupoComprasCreate(GrupoComprasBase):
    pass


class GrupoComprasUpdate(BaseModel):
    nombre: str | None = None
    to: EmailStr | None = None
    cc: list[EmailStr] | None = None
    es_default: bool | None = None


class GrupoComprasRead(GrupoComprasBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
