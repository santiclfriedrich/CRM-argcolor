"""Autocompletar formularios de licitación con IA a partir del Perfil de Empresa.

- /completar: sube un PDF y la IA propone el valor de cada campo (para revisar).
  Distingue PDF rellenable (AcroForm) de PDF plano.
- /rellenar: para PDFs rellenables, escribe los valores revisados en el
  formulario ORIGINAL y lo devuelve ya completo.
"""

import io
import json

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_ai, get_current_user
from app.db.models.usuarios import Usuario
from app.db.session import get_db
from app.integrations.ai.base import (
    AIProvider,
    DocumentPart,
    FormularioCompletado,
    Ubicaciones,
)
from app.services import acroform
from app.services.estampado import estampar
from app.services.perfil_empresa import get_perfil_empresa

router = APIRouter(prefix="/formularios", tags=["formularios"])


def _leer_pdf(archivo: UploadFile) -> bytes:
    if (archivo.content_type or "") not in ("application/pdf", "application/x-pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Subí el formulario en PDF."
        )
    data = archivo.file.read()
    if not data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="El archivo está vacío."
        )
    return data


class Deteccion(BaseModel):
    """Cómo conviene completar el formulario según su tipo."""

    rellenable: bool  # True = AcroForm con etiquetas legibles → auto-relleno


@router.post("/detectar", response_model=Deteccion)
def detectar_formulario(
    archivo: UploadFile = File(...),
    _: Usuario = Depends(get_current_user),
) -> Deteccion:
    """Chequeo rápido (sin IA): decide si el PDF conviene por auto-relleno
    (rellenable con etiquetas legibles) o por el editor visual."""
    data = _leer_pdf(archivo)
    return Deteccion(rellenable=acroform.es_util_rellenable(data))


@router.post("/completar", response_model=FormularioCompletado)
def completar_formulario(
    archivo: UploadFile = File(...),
    db: Session = Depends(get_db),
    ai: AIProvider = Depends(get_ai),
    _: Usuario = Depends(get_current_user),
) -> FormularioCompletado:
    """Sube un formulario (PDF) y devuelve, por campo, el valor sugerido según el
    Perfil de Empresa. Marca si el PDF es rellenable (se puede bajar completo)."""
    data = _leer_pdf(archivo)
    perfil = get_perfil_empresa(db)
    try:
        if acroform.es_util_rellenable(data):
            res = ai.mapear_acroform(perfil, acroform.leer_campos(data))
            res.rellenable = True
        else:
            documento = DocumentPart(
                data=data, mime_type="application/pdf", filename=archivo.filename
            )
            res = ai.completar_formulario(perfil, documento)
            res.rellenable = False
        return res
    except NotImplementedError as exc:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED, detail=str(exc)
        ) from exc
    except Exception as exc:  # noqa: BLE001 - frontera con la IA
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"No se pudo procesar el formulario con la IA: {exc}",
        ) from exc


@router.post("/rellenar")
def rellenar_formulario(
    archivo: UploadFile = File(...),
    campos: str = Form(...),
    _: Usuario = Depends(get_current_user),
) -> StreamingResponse:
    """Rellena el PDF ORIGINAL (rellenable/AcroForm) con los valores revisados y lo
    devuelve ya completo. `campos` es un JSON [{campo, valor}]."""
    data = _leer_pdf(archivo)
    if not acroform.tiene_campos(data):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Este formulario es plano (no rellenable). Hay que armar su plantilla.",
        )
    try:
        items = json.loads(campos)
        valores = {
            c["campo"]: c.get("valor", "")
            for c in items
            if isinstance(c, dict) and c.get("campo")
        }
    except (json.JSONDecodeError, TypeError, KeyError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Campos inválidos."
        ) from exc

    pdf = acroform.rellenar(data, valores)
    base = (archivo.filename or "formulario").rsplit(".", 1)[0]
    nombre = f"{base} - completo.pdf"
    return StreamingResponse(
        io.BytesIO(pdf),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{nombre}"'},
    )


@router.post("/ubicar", response_model=Ubicaciones)
def ubicar_campos(
    archivo: UploadFile = File(...),
    etiquetas: str = Form(...),
    ai: AIProvider = Depends(get_ai),
    _: Usuario = Depends(get_current_user),
) -> Ubicaciones:
    """Ayuda de IA (visión): propone dónde va cada etiqueta en el PDF plano, en
    fracciones 0..1. El usuario lo corrige en el editor."""
    data = _leer_pdf(archivo)
    try:
        lista = json.loads(etiquetas)
        if not isinstance(lista, list):
            raise ValueError
    except (json.JSONDecodeError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Etiquetas inválidas."
        ) from exc
    documento = DocumentPart(
        data=data, mime_type="application/pdf", filename=archivo.filename
    )
    try:
        return ai.ubicar_campos([str(x) for x in lista], documento)
    except NotImplementedError as exc:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED, detail=str(exc)
        ) from exc
    except Exception as exc:  # noqa: BLE001 - frontera con la IA
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"No se pudo ubicar con IA: {exc}",
        ) from exc


@router.post("/rellenar-plano")
def rellenar_plano(
    archivo: UploadFile = File(...),
    posiciones: str = Form(...),
    _: Usuario = Depends(get_current_user),
) -> StreamingResponse:
    """Estampa texto sobre un PDF plano según las posiciones del editor visual y lo
    devuelve. `posiciones` es un JSON [{page, x, y, valor, size?}] con x,y en 0..1."""
    data = _leer_pdf(archivo)
    try:
        items = json.loads(posiciones)
        if not isinstance(items, list):
            raise ValueError
    except (json.JSONDecodeError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Posiciones inválidas."
        ) from exc

    pdf = estampar(data, items)
    base = (archivo.filename or "formulario").rsplit(".", 1)[0]
    nombre = f"{base} - completo.pdf"
    return StreamingResponse(
        io.BytesIO(pdf),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{nombre}"'},
    )
