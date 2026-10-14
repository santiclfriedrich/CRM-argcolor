"""Autocompletar formularios de licitación con IA a partir del Perfil de Empresa."""

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.api.deps import get_ai, get_current_user
from app.db.models.usuarios import Usuario
from app.db.session import get_db
from app.integrations.ai.base import AIProvider, DocumentPart, FormularioCompletado
from app.services.perfil_empresa import get_perfil_empresa

router = APIRouter(prefix="/formularios", tags=["formularios"])


@router.post("/completar", response_model=FormularioCompletado)
def completar_formulario(
    archivo: UploadFile = File(...),
    db: Session = Depends(get_db),
    ai: AIProvider = Depends(get_ai),
    _: Usuario = Depends(get_current_user),
) -> FormularioCompletado:
    """Sube un formulario (PDF) y devuelve, por campo, el valor sugerido según el
    Perfil de Empresa. La IA lee el PDF; el usuario después revisa."""
    if (archivo.content_type or "") not in ("application/pdf", "application/x-pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Subí el formulario en PDF.",
        )
    data = archivo.file.read()
    if not data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="El archivo está vacío."
        )

    perfil = get_perfil_empresa(db)
    documento = DocumentPart(
        data=data, mime_type="application/pdf", filename=archivo.filename
    )
    try:
        return ai.completar_formulario(perfil, documento)
    except NotImplementedError as exc:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED, detail=str(exc)
        ) from exc
    except Exception as exc:  # noqa: BLE001 - frontera con la IA
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"No se pudo procesar el formulario con la IA: {exc}",
        ) from exc
