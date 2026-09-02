"""Pydantic schemas para los speeches (plantillas de requerimiento), por usuario."""

from pydantic import BaseModel, ConfigDict


class SpeechBase(BaseModel):
    titulo: str
    texto: str


class SpeechCreate(SpeechBase):
    pass


class SpeechUpdate(BaseModel):
    titulo: str | None = None
    texto: str | None = None


class SpeechRead(SpeechBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
