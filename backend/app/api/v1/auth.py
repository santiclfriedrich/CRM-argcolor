"""Auth endpoints. The frontend exchanges a Google ID token for a local JWT."""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.auth import verify_google_id_token
from app.core.security import create_access_token
from app.db.models.usuarios import Usuario
from app.db.session import get_db
from app.schemas.usuario import UsuarioRead

router = APIRouter(prefix="/auth", tags=["auth"])


class GoogleLoginRequest(BaseModel):
    id_token: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    usuario: UsuarioRead


@router.post("/login", response_model=TokenResponse)
def login_with_google(body: GoogleLoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    """Verify Google ID token and issue a local JWT.

    Only pre-registered, active users can log in (whitelist enforced en DB).
    """
    claims = verify_google_id_token(body.id_token)
    if claims is None or "email" not in claims:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Token de Google inválido"
        )

    email = claims["email"]
    user = db.scalar(select(Usuario).where(Usuario.email == email))
    if user is None or not user.activo:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Usuario no autorizado. Pedí al admin que te dé de alta.",
        )

    token = create_access_token(subject=email, extra_claims={"rol": user.rol.value})
    return TokenResponse(access_token=token, usuario=UsuarioRead.model_validate(user))


@router.get("/me", response_model=UsuarioRead)
def me(current: Usuario = Depends(get_current_user)) -> Usuario:
    """Return the currently authenticated user."""
    return current
