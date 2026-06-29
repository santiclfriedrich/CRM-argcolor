"""Bandeja inteligente: ingesta manual de mails y listado de procesados."""

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_ai, get_current_user, get_gmail
from app.core.exceptions import NotFoundError
from app.db.models.adjuntos import Adjunto
from app.db.models.mails import DireccionMail, Mail
from app.db.models.oportunidades import Oportunidad
from app.db.models.usuarios import Usuario
from app.db.session import get_db
from app.integrations.ai.base import AIProvider
from app.schemas.mail import IngestEmailRequest, MailRead
from app.services.acuse import send_aclaracion, send_acuse
from app.services.gmail_poller import poll_all_mailboxes
from app.services.ingest import process_incoming_email

router = APIRouter(prefix="/mails", tags=["bandeja"])

_RELATIONS = (
    selectinload(Mail.oportunidad).selectinload(Oportunidad.cliente),
    selectinload(Mail.archivos),
)


@router.get("/adjuntos/{adjunto_id}")
def get_adjunto(
    adjunto_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
) -> FileResponse:
    """Sirve el archivo de un adjunto (imagen) para mostrarlo en la bandeja."""
    adjunto = db.get(Adjunto, adjunto_id)
    if adjunto is None or not adjunto.path_storage or not Path(adjunto.path_storage).exists():
        raise NotFoundError("Adjunto no encontrado")
    return FileResponse(
        adjunto.path_storage,
        media_type=adjunto.mime_type or "application/octet-stream",
        filename=adjunto.nombre_archivo,
    )


def _get_loaded(db: Session, mail_id: int) -> Mail:
    mail = db.get(Mail, mail_id, options=list(_RELATIONS))
    if mail is None:
        raise NotFoundError("Mail no encontrado")
    return mail


@router.post("/ingest", response_model=MailRead, status_code=201)
def ingest_email(
    body: IngestEmailRequest,
    db: Session = Depends(get_db),
    ai: AIProvider = Depends(get_ai),
    _: Usuario = Depends(get_current_user),
) -> Mail:
    """Procesa un mail entrante: identifica cliente/contacto, extrae con IA y
    crea la oportunidad. El transporte real (Gmail) usará este mismo pipeline."""
    try:
        mail = process_incoming_email(
            db,
            ai,
            de=body.de,
            asunto=body.asunto,
            cuerpo=body.cuerpo,
            para=body.para,
            fecha=body.fecha,
        )
    except Exception as exc:  # noqa: BLE001 - frontera con servicio externo (IA)
        # Devolvemos el error real del proveedor de IA para no enmascararlo.
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Error al procesar con IA: {exc}",
        ) from exc
    return _get_loaded(db, mail.id)


@router.post("/sync")
def sync_gmail(
    db: Session = Depends(get_db),
    ai: AIProvider = Depends(get_ai),
    _: Usuario = Depends(get_current_user),
) -> dict[str, int]:
    """Dispara una corrida de polling ahora mismo (todas las casillas configuradas).

    Útil para probar sin esperar al scheduler. Requiere Gmail configurado."""
    try:
        procesados = poll_all_mailboxes(db, ai)
    except Exception as exc:  # noqa: BLE001 - frontera con Gmail
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Error al sincronizar Gmail: {exc}",
        ) from exc
    return {"procesados": procesados}


@router.get("", response_model=list[MailRead])
def list_mails(
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
) -> list[Mail]:
    query = (
        select(Mail)
        .where(Mail.direccion == DireccionMail.entrante)
        .options(*_RELATIONS)
        .order_by(Mail.created_at.desc())
    )
    return list(db.scalars(query))


@router.get("/{mail_id}", response_model=MailRead)
def get_mail(
    mail_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
) -> Mail:
    return _get_loaded(db, mail_id)


@router.post("/{mail_id}/acuse", response_model=MailRead, status_code=201)
def enviar_acuse(
    mail_id: int,
    db: Session = Depends(get_db),
    gmail=Depends(get_gmail),  # noqa: ANN001 - GmailClient
    _: Usuario = Depends(get_current_user),
) -> Mail:
    """Envía el acuse de recibo al cliente para un mail entrante."""
    mail = _get_loaded(db, mail_id)
    try:
        salida = send_acuse(db, gmail, mail)
    except Exception as exc:  # noqa: BLE001 - frontera con Gmail
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"No se pudo enviar el acuse: {exc}",
        ) from exc
    return _get_loaded(db, salida.id)


@router.post("/{mail_id}/aclaracion", response_model=MailRead, status_code=201)
def enviar_aclaracion(
    mail_id: int,
    db: Session = Depends(get_db),
    gmail=Depends(get_gmail),  # noqa: ANN001 - GmailClient
    _: Usuario = Depends(get_current_user),
) -> Mail:
    """Envía al cliente el borrador de aclaración redactado por la IA."""
    mail = _get_loaded(db, mail_id)
    try:
        salida = send_aclaracion(db, gmail, mail)
    except Exception as exc:  # noqa: BLE001 - frontera con Gmail
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"No se pudo enviar la aclaración: {exc}",
        ) from exc
    return _get_loaded(db, salida.id)
