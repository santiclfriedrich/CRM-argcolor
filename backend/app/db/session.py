"""Database engine and session factory."""

from collections.abc import Generator
from datetime import datetime, timezone

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from app.config import settings

engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,  # evita conexiones muertas (importante con pooler de Supabase)
    echo=settings.DEBUG,
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


@event.listens_for(Session, "before_flush")
def _sincronizar_fecha_cierre(session: Session, flush_context, instances) -> None:  # noqa: ANN001
    """Mantiene `Oportunidad.fecha_cierre` en sincronía con el estado: la setea al
    pasar a un estado cerrado (si estaba vacía) y la limpia si vuelve a abrirse.
    Centralizado acá para cubrir todos los caminos que cambian el estado."""
    from app.db.models.oportunidades import ESTADOS_CERRADOS, Oportunidad

    for obj in (*session.new, *session.dirty):
        if not isinstance(obj, Oportunidad):
            continue
        cerrada = obj.estado in ESTADOS_CERRADOS
        if cerrada and obj.fecha_cierre is None:
            obj.fecha_cierre = datetime.now(timezone.utc)
        elif not cerrada and obj.fecha_cierre is not None:
            obj.fecha_cierre = None


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency that yields a DB session and closes it afterwards."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
