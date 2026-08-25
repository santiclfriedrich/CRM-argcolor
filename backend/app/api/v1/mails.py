"""Bandeja inteligente: ingesta manual de mails y listado de procesados."""

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, defer, selectinload, with_expression

from app.api.deps import (
    get_ai,
    get_current_user,
    get_gmail,
    get_user_gmail,
    resolver_duenio,
)
from app.core.exceptions import NotFoundError
from app.db.models.adjuntos import Adjunto
from app.db.models.mails import DireccionMail, Mail
from app.db.models.mails_descartados import MailDescartado
from app.db.models.oportunidades import AmbitoOportunidad, Oportunidad
from app.db.models.usuarios import Usuario
from app.db.session import get_db
from app.integrations.ai.base import AIProvider
from app.schemas.mail import (
    AclaracionBody,
    DescartadoRead,
    IngestEmailRequest,
    IngestResult,
    MailListItem,
    MailRead,
    ResponderRequest,
)
from app.services.acuse import send_aclaracion, send_acuse, send_respuesta
from app.services.gmail_poller import poll_user_mailbox
from app.services.ingest import process_incoming_email
from app.services.storage import get_storage

router = APIRouter(prefix="/mails", tags=["bandeja"])

_RELATIONS = (
    selectinload(Mail.oportunidad).selectinload(Oportunidad.cliente),
    selectinload(Mail.oportunidad).selectinload(Oportunidad.vendedor),
    selectinload(Mail.archivos),
)


@router.get("/adjuntos/{adjunto_id}")
def get_adjunto(
    adjunto_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> Response:
    """Sirve el archivo de un adjunto (imagen) para mostrarlo en la bandeja."""
    adjunto = db.get(Adjunto, adjunto_id)
    if adjunto is None or not adjunto.path_storage:
        raise NotFoundError("Adjunto no encontrado")
    if adjunto.mail is not None:
        _assert_owner(adjunto.mail, current_user)
    try:
        data = get_storage().get(adjunto.path_storage)
    except FileNotFoundError as exc:
        raise NotFoundError("Adjunto no encontrado") from exc
    return Response(
        content=data,
        media_type=adjunto.mime_type or "application/octet-stream",
        headers={"Content-Disposition": f'inline; filename="{adjunto.nombre_archivo}"'},
    )


def _get_loaded(db: Session, mail_id: int) -> Mail:
    mail = db.get(Mail, mail_id, options=list(_RELATIONS))
    if mail is None:
        raise NotFoundError("Mail no encontrado")
    return mail


def _assert_owner(mail: Mail, user: Usuario) -> None:
    """Acceso compartido: cualquier usuario puede ver/actuar sobre cualquier
    mail. Se mantiene la función (no-op) para no tocar los call sites."""
    return


@router.post("/ingest", response_model=IngestResult, status_code=201)
def ingest_email(
    body: IngestEmailRequest,
    db: Session = Depends(get_db),
    ai: AIProvider = Depends(get_ai),
    current_user: Usuario = Depends(get_current_user),
) -> IngestResult:
    """Procesa un mail entrante: identifica cliente/contacto, extrae con IA y
    crea la oportunidad. El transporte real (Gmail) usará este mismo pipeline.

    La oportunidad queda a nombre del usuario logueado (dueño de la casilla que
    recibió el mail); las cuentas son compartidas y no cambian esa asignación.
    Si la IA lo clasifica como no comercial, no crea oportunidad y devuelve un
    aviso de descarte."""
    try:
        mail = process_incoming_email(
            db,
            ai,
            de=body.de,
            asunto=body.asunto,
            cuerpo=body.cuerpo,
            para=body.para,
            fecha=body.fecha,
            default_vendedor_id=current_user.id,
        )
    except Exception as exc:  # noqa: BLE001 - frontera con servicio externo (IA)
        # Devolvemos el error real del proveedor de IA para no enmascararlo.
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Error al procesar con IA: {exc}",
        ) from exc

    if mail is None:
        # Recuperamos la categoría del último descartado de este remitente.
        categoria = db.scalar(
            select(MailDescartado.categoria)
            .where(MailDescartado.de == body.de)
            .order_by(MailDescartado.id.desc())
        )
        return IngestResult(descartado=True, categoria=categoria)
    return IngestResult(mail=MailRead.model_validate(_get_loaded(db, mail.id)))


@router.post("/sync")
def sync_gmail(
    db: Session = Depends(get_db),
    ai: AIProvider = Depends(get_ai),
    current_user: Usuario = Depends(get_current_user),
) -> dict[str, int | str | None]:
    """Sincroniza SOLO la casilla del usuario logueado (su propio Gmail).

    Cada vendedor lee únicamente su casilla y los mails quedan a su nombre; el
    sync de un usuario nunca toca la de otro. El polling de todas las casillas
    corre aparte en el scheduler de fondo.
    Devuelve {procesados, errores, ultimo_error}."""
    try:
        resultado = poll_user_mailbox(db, ai, current_user)
    except Exception as exc:  # noqa: BLE001 - frontera con Gmail
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Error al sincronizar Gmail: {exc}",
        ) from exc
    # Auto-ingesta de respuestas de Compras desde los hilos de las solicitudes.
    from app.services.compras_ingest import ingerir_respuestas_compras

    try:
        resultado["respuestas_compras"] = ingerir_respuestas_compras(db, ai)
    except Exception:  # noqa: BLE001 - no debe cortar el sync
        resultado["respuestas_compras"] = 0
    return resultado


# Tope de seguridad de la bandeja: se muestran los más nuevos. Es holgado para
# el uso real y evita volcar toda la tabla si crece mucho. El cuerpo se trae al
# abrir la conversación, no acá.
_BANDEJA_LIMIT = 500


@router.get("", response_model=list[MailListItem])
def list_mails(
    usuario_id: int | None = None,
    oportunidad_id: int | None = None,
    ambito: AmbitoOportunidad | None = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> list[Mail]:
    """Bandeja personal: cada vendedor ve solo los mails de sus oportunidades.
    Los admin ven la bandeja de todo el equipo, o filtran por `usuario_id` (perfil).
    Con `oportunidad_id` se limita a los mails de esa oportunidad (detalle).
    `ambito` limita a la sección (corporativo/gubernamental) por el ámbito de la
    oportunidad del mail.

    No trae el cuerpo del mail (puede ser grande): lo defiere en el SELECT y solo
    computa `tiene_cuerpo`. El texto completo se pide al abrir la conversación."""
    query = (
        select(Mail)
        .where(Mail.direccion == DireccionMail.entrante)
        .options(
            *_RELATIONS,
            defer(Mail.cuerpo),
            with_expression(
                Mail.tiene_cuerpo, func.length(func.coalesce(Mail.cuerpo, "")) > 0
            ),
        )
        .order_by(Mail.created_at.desc())
        .limit(_BANDEJA_LIMIT)
    )
    if oportunidad_id is not None:
        query = query.where(Mail.oportunidad_id == oportunidad_id)
    duenio_id = resolver_duenio(current_user, usuario_id)
    if duenio_id is not None or ambito is not None:
        query = query.join(Oportunidad, Mail.oportunidad_id == Oportunidad.id)
        if duenio_id is not None:
            query = query.where(Oportunidad.vendedor_id == duenio_id)
        if ambito is not None:
            query = query.where(Oportunidad.ambito == ambito.value)
    return list(db.scalars(query))


@router.get("/descartados", response_model=list[DescartadoRead])
def list_descartados(
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
) -> list[MailDescartado]:
    """Mails que la IA clasificó como no comerciales (no generaron oportunidad)."""
    query = (
        select(MailDescartado)
        .where(MailDescartado.categoria.not_in(["eliminado_manual", "remitente_ignorado"]))
        .order_by(MailDescartado.created_at.desc())
        .limit(100)
    )
    return list(db.scalars(query))


@router.delete("/descartados/{descartado_id}", status_code=204)
def reprocesar_descartado(
    descartado_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
) -> Response:
    """Saca un mail de la lista de descartados para que la próxima sincronización
    lo vuelva a leer y reclasificar (útil si la IA lo descartó por error)."""
    descartado = db.get(MailDescartado, descartado_id)
    if descartado is None:
        raise NotFoundError("Descartado no encontrado")
    db.delete(descartado)
    db.commit()
    return Response(status_code=204)


@router.get("/{mail_id}/hilo", response_model=list[MailRead])
def get_hilo(
    mail_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> list[Mail]:
    """Toda la conversación del mail: entrantes y salientes del mismo hilo /
    oportunidad, en orden cronológico. Alimenta el chat de la bandeja."""
    mail = _get_loaded(db, mail_id)
    _assert_owner(mail, current_user)
    condiciones = []
    if mail.oportunidad_id is not None:
        condiciones.append(Mail.oportunidad_id == mail.oportunidad_id)
    if mail.gmail_thread_id:
        condiciones.append(Mail.gmail_thread_id == mail.gmail_thread_id)
    if not condiciones:
        return [mail]
    query = (
        select(Mail)
        .where(or_(*condiciones))
        .options(*_RELATIONS)
        .order_by(Mail.fecha.asc().nullslast(), Mail.id.asc())
    )
    return list(db.scalars(query))


@router.post("/{mail_id}/responder", response_model=MailRead, status_code=201)
def responder_mail(
    mail_id: int,
    body: ResponderRequest,
    db: Session = Depends(get_db),
    gmail=Depends(get_user_gmail),  # noqa: ANN001 - GmailClient del usuario logueado
    current_user: Usuario = Depends(get_current_user),
) -> Mail:
    """Responde al cliente con texto libre, dentro del mismo hilo, desde la
    casilla del vendedor logueado (chat de la bandeja)."""
    if not body.cuerpo or not body.cuerpo.strip():
        raise HTTPException(status_code=400, detail="La respuesta no puede estar vacía.")
    mail = _get_loaded(db, mail_id)
    _assert_owner(mail, current_user)
    try:
        salida = send_respuesta(
            db, gmail, mail, body.cuerpo, remitente=current_user.email, asunto=body.asunto
        )
    except Exception as exc:  # noqa: BLE001 - frontera con Gmail
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"No se pudo enviar la respuesta: {exc}",
        ) from exc
    return _get_loaded(db, salida.id)


@router.get("/{mail_id}", response_model=MailRead)
def get_mail(
    mail_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> Mail:
    mail = _get_loaded(db, mail_id)
    _assert_owner(mail, current_user)
    return mail


@router.post("/{mail_id}/acuse", response_model=MailRead, status_code=201)
def enviar_acuse(
    mail_id: int,
    db: Session = Depends(get_db),
    gmail=Depends(get_gmail),  # noqa: ANN001 - GmailClient
    current_user: Usuario = Depends(get_current_user),
) -> Mail:
    """Envía el acuse de recibo al cliente para un mail entrante."""
    mail = _get_loaded(db, mail_id)
    _assert_owner(mail, current_user)
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
    body: AclaracionBody | None = None,
    db: Session = Depends(get_db),
    gmail=Depends(get_gmail),  # noqa: ANN001 - GmailClient
    current_user: Usuario = Depends(get_current_user),
) -> Mail:
    """Envía al cliente la aclaración (el borrador de la IA o el editado a mano)."""
    mail = _get_loaded(db, mail_id)
    _assert_owner(mail, current_user)
    try:
        salida = send_aclaracion(db, gmail, mail, cuerpo=body.cuerpo if body else None)
    except Exception as exc:  # noqa: BLE001 - frontera con Gmail
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"No se pudo enviar la aclaración: {exc}",
        ) from exc
    return _get_loaded(db, salida.id)
