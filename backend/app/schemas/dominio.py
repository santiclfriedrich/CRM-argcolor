"""Pydantic schemas for DominioCliente."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator


def _normalize_domain(value: str) -> str:
    """Lowercase + strip so domain matching stays consistent."""
    return value.strip().lower()


class DominioBase(BaseModel):
    dominio: str
    es_principal_dominio: bool = False
    notas: str | None = None

    @field_validator("dominio")
    @classmethod
    def normalize_dominio(cls, value: str) -> str:
        return _normalize_domain(value)


class DominioCreate(DominioBase):
    pass


class DominioUpdate(BaseModel):
    dominio: str | None = None
    es_principal_dominio: bool | None = None
    notas: str | None = None

    @field_validator("dominio")
    @classmethod
    def normalize_dominio(cls, value: str | None) -> str | None:
        return _normalize_domain(value) if value else value


class DominioRead(DominioBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    cliente_id: int
    created_at: datetime
