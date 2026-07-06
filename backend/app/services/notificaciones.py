"""Notificaciones in-app: avisos para los usuarios dentro del CRM."""

from sqlalchemy.orm import Session

from app.db.models.notificaciones import Notificacion


def crear_notificacion(
    db: Session, usuario_id: int, mensaje: str, link: str | None = None
) -> Notificacion:
    """Crea una notificación para un usuario. NO commitea: lo hace el caller,
    para agruparla en la misma transacción que la disparó."""
    noti = Notificacion(usuario_id=usuario_id, mensaje=mensaje, link=link)
    db.add(noti)
    return noti
