"""API del bot de carga de presupuestos en GBP (worker Playwright self-hosted).

Token de servicio por header `X-Bot-Token` (setting GBP_BOT_TOKEN). El bot inicia
todas las conexiones (outbound); el CRM nunca entra a la PC. Opera sobre el
`Presupuesto` del CRM vía el servicio presupuestos_gbp.

Las altas/consultas de presupuestos (incluido el standalone y el botón
"Cargar en GBP") viven en el router de presupuestos.
"""

from __future__ import annotations

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    Header,
    HTTPException,
    Response,
    UploadFile,
    status,
)
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.session import get_db
from app.schemas.presupuesto import PresupuestoRead
from app.schemas.presupuesto_gbp import ErrorBotIn, JobBotRead
from app.services import presupuestos_gbp as svc

router = APIRouter(prefix="/gbp-bot", tags=["gbp-bot"])


def verificar_bot(x_bot_token: str = Header(default="")) -> None:
    esperado = get_settings().GBP_BOT_TOKEN
    if not esperado or x_bot_token != esperado:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Token de bot inválido")


@router.get("/jobs/next", response_model=None, dependencies=[Depends(verificar_bot)])
def proximo_job(db: Session = Depends(get_db)) -> JobBotRead | Response:
    job = svc.tomar_siguiente(db)
    if job is None:
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    return svc.build_job(job)


@router.post(
    "/jobs/{presupuesto_id}/resultado",
    response_model=PresupuestoRead,
    dependencies=[Depends(verificar_bot)],
)
async def registrar_resultado(
    presupuesto_id: int,
    numero_gbp: str = Form(...),
    pdf: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> PresupuestoRead:
    contenido = await pdf.read()
    try:
        presupuesto = svc.registrar_resultado(db, presupuesto_id, numero_gbp, contenido)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    return PresupuestoRead.model_validate(presupuesto)


@router.post(
    "/jobs/{presupuesto_id}/error",
    response_model=PresupuestoRead,
    dependencies=[Depends(verificar_bot)],
)
def registrar_error(
    presupuesto_id: int,
    data: ErrorBotIn,
    db: Session = Depends(get_db),
) -> PresupuestoRead:
    return PresupuestoRead.model_validate(svc.registrar_error(db, presupuesto_id, data.mensaje))
