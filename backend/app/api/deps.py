"""Shared FastAPI dependencies: DB session and current authenticated user."""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.db.models.usuarios import RolUsuario, Usuario
from app.db.session import get_db
from app.integrations.ai.base import AIProvider
from app.integrations.ai.factory import get_ai_provider

bearer_scheme = HTTPBearer(auto_error=False)


def get_ai() -> AIProvider:
    """Proveedor de IA configurado. Override en tests con un fake."""
    return get_ai_provider()


def get_gmail():  # noqa: ANN201 - GmailClient, import perezoso para no acoplar deps
    """Cliente de Gmail configurado (Camino A). Override en tests con un fake."""
    from app.integrations.gmail.client import GmailClient

    return GmailClient()


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> Usuario:
    """Resolve the current user from the Bearer JWT issued by /auth/login."""
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Falta token de autenticación"
        )

    payload = decode_access_token(credentials.credentials)
    if payload is None or "sub" not in payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")

    user = db.scalar(select(Usuario).where(Usuario.email == payload["sub"]))
    if user is None or not user.activo:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario inactivo")
    return user


def get_current_admin(current: Usuario = Depends(get_current_user)) -> Usuario:
    """Igual que get_current_user pero exige rol admin (para el ABM de usuarios)."""
    if current.rol != RolUsuario.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Necesitás rol admin para esta acción.",
        )
    return current


def es_admin(user: Usuario) -> bool:
    """True si el usuario tiene rol admin (ve la gestión de todo el equipo)."""
    return user.rol == RolUsuario.admin


def resolver_duenio(user: Usuario, usuario_id: int | None) -> int | None:
    """Filtro opcional por usuario para los listados.

    La gestión es COMPARTIDA: todos ven todo. El filtro es solo una comodidad de
    la UI (toggle Mías/Todas): si viene `usuario_id`, se acota a ese usuario;
    si no viene, no se filtra (se ve todo). Cualquier usuario puede usarlo.
    """
    return usuario_id


def get_user_gmail(current: Usuario = Depends(get_current_user)):  # noqa: ANN201
    """Cliente de Gmail del usuario logueado (Camino C: su propio refresh token).

    Así las respuestas que el vendedor escribe desde la bandeja salen de *su*
    casilla. Si el usuario todavía no conectó su Gmail, cae a la casilla global
    (Camino A). Override en tests con un fake."""
    from app.core.crypto import decrypt
    from app.integrations.gmail.client import GmailClient

    if current.gmail_refresh_token:
        token = decrypt(current.gmail_refresh_token)
        if token:
            return GmailClient(refresh_token=token)
    return GmailClient()
