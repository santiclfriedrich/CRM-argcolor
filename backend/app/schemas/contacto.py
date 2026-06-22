"""Pydantic schemas for ContactoCliente."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr

from app.db.models.contactos_cliente import RolCompra


class ContactoBase(BaseModel):
    nombre: str
    email: EmailStr | None = None
    telefono: str | None = None
    cargo: str | None = None
    rol_compra: RolCompra = RolCompra.otro
    es_principal: bool = False
    activo: bool = True
    notas: str | None = None


class ContactoCreate(ContactoBase):
    pass


class ContactoUpdate(BaseModel):
    nombre: str | None = None
    email: EmailStr | None = None
    telefono: str | None = None
    cargo: str | None = None
    rol_compra: RolCompra | None = None
    es_principal: bool | None = None
    activo: bool | None = None
    notas: str | None = None


class ContactoRead(ContactoBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    cliente_id: int
    created_at: datetime
