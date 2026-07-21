"""Grupos de destinatarios de Compras, por usuario.

Cada vendedor arma sus grupos (nombre + destinatario principal + CC) y marca uno
como default. Al pedir a Compras se elige uno (o viene el default).
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models.grupos_compras import GrupoCompras


def list_grupos(db: Session, usuario_id: int) -> list[GrupoCompras]:
    return list(
        db.scalars(
            select(GrupoCompras)
            .where(GrupoCompras.usuario_id == usuario_id)
            .order_by(GrupoCompras.es_default.desc(), GrupoCompras.nombre)
        )
    )


def get_grupo(db: Session, grupo_id: int, usuario_id: int) -> GrupoCompras | None:
    """Devuelve el grupo solo si pertenece al usuario (evita acceso ajeno)."""
    grupo = db.get(GrupoCompras, grupo_id)
    if grupo is None or grupo.usuario_id != usuario_id:
        return None
    return grupo


def get_default_grupo(db: Session, usuario_id: int) -> GrupoCompras | None:
    return db.scalar(
        select(GrupoCompras).where(
            GrupoCompras.usuario_id == usuario_id, GrupoCompras.es_default.is_(True)
        )
    )


def _limpiar_default(db: Session, usuario_id: int, excepto_id: int | None = None) -> None:
    """Deja a lo sumo un grupo default por usuario."""
    for g in db.scalars(
        select(GrupoCompras).where(
            GrupoCompras.usuario_id == usuario_id, GrupoCompras.es_default.is_(True)
        )
    ):
        if g.id != excepto_id:
            g.es_default = False


def create_grupo(
    db: Session, usuario_id: int, *, nombre: str, to: str, cc: list[str], es_default: bool
) -> GrupoCompras:
    # El primer grupo del usuario queda como default aunque no se pida.
    primero = not list_grupos(db, usuario_id)
    if es_default or primero:
        _limpiar_default(db, usuario_id)
    grupo = GrupoCompras(
        usuario_id=usuario_id,
        nombre=nombre,
        to=to,
        cc=cc or [],
        es_default=es_default or primero,
    )
    db.add(grupo)
    db.commit()
    db.refresh(grupo)
    return grupo


def update_grupo(
    db: Session,
    grupo: GrupoCompras,
    *,
    nombre: str | None = None,
    to: str | None = None,
    cc: list[str] | None = None,
    es_default: bool | None = None,
) -> GrupoCompras:
    if nombre is not None:
        grupo.nombre = nombre
    if to is not None:
        grupo.to = to
    if cc is not None:
        grupo.cc = cc
    if es_default is True:
        _limpiar_default(db, grupo.usuario_id, excepto_id=grupo.id)
        grupo.es_default = True
    elif es_default is False:
        grupo.es_default = False
    db.commit()
    db.refresh(grupo)
    return grupo


def delete_grupo(db: Session, grupo: GrupoCompras) -> None:
    era_default = grupo.es_default
    usuario_id = grupo.usuario_id
    db.delete(grupo)
    db.flush()
    # Si borramos el default, ascendemos otro (el primero que quede).
    if era_default:
        siguiente = db.scalar(
            select(GrupoCompras)
            .where(GrupoCompras.usuario_id == usuario_id)
            .order_by(GrupoCompras.nombre)
        )
        if siguiente is not None:
            siguiente.es_default = True
    db.commit()


def resolver_destino(
    db: Session, usuario_id: int, grupo_id: int | None
) -> tuple[str | None, list[str]]:
    """(to, cc) del grupo elegido; si no se eligió, del default del usuario.

    Devuelve (None, []) si el usuario no tiene grupos (el envío cae al global)."""
    grupo = None
    if grupo_id is not None:
        grupo = get_grupo(db, grupo_id, usuario_id)
    if grupo is None:
        grupo = get_default_grupo(db, usuario_id)
    if grupo is None:
        return None, []
    return grupo.to, list(grupo.cc or [])
