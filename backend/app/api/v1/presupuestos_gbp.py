"""Presupuestos a cargar en GBP: alta/consulta (usuario) + API del bot (token).

- Usuario logueado: crea el presupuesto (desde la pantalla de revisión del
  import), lista y descarga el PDF.
- Bot (worker Playwright self-hosted, token por header `X-Bot-Token`): pide el
  próximo job, sube el resultado (PDF + N° de GBP) o reporta el error.

El bot inicia todas las conexiones (outbound); el CRM nunca entra a la PC.
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

from app.api.deps import get_current_user
from app.config import get_settings
from app.db.models.usuarios import Usuario
from app.db.session import get_db
from app.schemas.presupuesto_gbp import (
    ErrorBotIn,
    ItemBotRead,
    JobBotRead,
    PresupuestoGbpCreate,
    PresupuestoGbpListItem,
    PresupuestoGbpRead,
)
from app.services import presupuestos_gbp as svc
from app.services.storage import get_storage

router = APIRouter(tags=["presupuestos-gbp"])


# --- Endpoints de usuario (CRM) ---
@router.post("/presupuestos-gbp", response_model=PresupuestoGbpRead, status_code=201)
def crear_presupuesto(
    data: PresupuestoGbpCreate,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user),
) -> PresupuestoGbpRead:
    presupuesto = svc.crear(db, data, creado_por_id=usuario.id)
    return PresupuestoGbpRead.model_validate(presupuesto)


@router.get("/presupuestos-gbp", response_model=list[PresupuestoGbpListItem])
def listar_presupuestos(
    estado: str | None = None,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
) -> list[PresupuestoGbpListItem]:
    return [PresupuestoGbpListItem.model_validate(p) for p in svc.listar(db, estado)]


@router.get("/presupuestos-gbp/{presupuesto_id}", response_model=PresupuestoGbpRead)
def obtener_presupuesto(
    presupuesto_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
) -> PresupuestoGbpRead:
    return PresupuestoGbpRead.model_validate(svc.obtener(db, presupuesto_id))


@router.get("/presupuestos-gbp/{presupuesto_id}/pdf")
def descargar_pdf(
    presupuesto_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
) -> Response:
    presupuesto = svc.obtener(db, presupuesto_id)
    if not presupuesto.pdf_key:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Todavía no hay PDF")
    data = get_storage().get(presupuesto.pdf_key)
    return Response(content=data, media_type="application/pdf")


# --- API del bot (token de servicio) ---
def verificar_bot(x_bot_token: str = Header(default="")) -> None:
    esperado = get_settings().GBP_BOT_TOKEN
    if not esperado or x_bot_token != esperado:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Token de bot inválido")


@router.get("/gbp-bot/jobs/next", response_model=None, dependencies=[Depends(verificar_bot)])
def proximo_job(db: Session = Depends(get_db)) -> JobBotRead | Response:
    job = svc.tomar_siguiente(db)
    if job is None:
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    return JobBotRead(
        id=job.id,
        cliente_numero=job.cliente_numero or "",
        entrega_por=job.entrega_por or "",
        moneda=job.moneda,
        documento=job.documento,
        items=[
            ItemBotRead(
                tipo=it.tipo,
                sku=it.sku,
                descripcion=it.descripcion,
                cantidad=it.cantidad,
                precio_usd=it.precio_usd,
                iva=it.iva,
            )
            for it in job.items
        ],
    )


@router.post(
    "/gbp-bot/jobs/{presupuesto_id}/resultado",
    response_model=PresupuestoGbpRead,
    dependencies=[Depends(verificar_bot)],
)
async def registrar_resultado(
    presupuesto_id: int,
    numero_gbp: str = Form(...),
    pdf: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> PresupuestoGbpRead:
    contenido = await pdf.read()
    try:
        presupuesto = svc.registrar_resultado(db, presupuesto_id, numero_gbp, contenido)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    return PresupuestoGbpRead.model_validate(presupuesto)


@router.post(
    "/gbp-bot/jobs/{presupuesto_id}/error",
    response_model=PresupuestoGbpRead,
    dependencies=[Depends(verificar_bot)],
)
def registrar_error(
    presupuesto_id: int,
    data: ErrorBotIn,
    db: Session = Depends(get_db),
) -> PresupuestoGbpRead:
    return PresupuestoGbpRead.model_validate(
        svc.registrar_error(db, presupuesto_id, data.mensaje)
    )
