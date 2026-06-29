"""Shared FastAPI dependencies: DB session and current authenticated user."""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.db.models.usuarios import Usuario
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
