"""Schemas del bloc de notas personal (varias notas por usuario)."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class NotaRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    contenido: str = ""
    updated_at: datetime | None = None


class NotaUpdate(BaseModel):
    contenido: str = ""
