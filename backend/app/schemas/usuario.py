"""Pydantic schemas for Usuario."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr

from app.db.models.usuarios import RolUsuario


class UsuarioBase(BaseModel):
    email: EmailStr
    nombre: str
    rol: RolUsuario = RolUsuario.vendedor
    activo: bool = True
    sync_mail_activo: bool = True


class UsuarioCreate(UsuarioBase):
    pass


class UsuarioUpdate(BaseModel):
    nombre: str | None = None
    rol: RolUsuario | None = None
    activo: bool | None = None
    sync_mail_activo: bool | None = None


# Auto-servicio: un usuario pausa/activa su propia sincronización de mails.
class MiSyncUpdate(BaseModel):
    sync_mail_activo: bool


class UsuarioRead(UsuarioBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    gmail_conectado: bool = False
    preferencias: dict | None = None
