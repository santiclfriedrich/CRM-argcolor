"""Database engine and session factory."""

from collections.abc import Generator
from datetime import datetime, timezone

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from app.config import settings

# Keepalives TCP: en corridas largas (ej. sync GBP) un commit sobre una conexión
# muerta se colgaría para siempre; con keepalives el SO detecta el corte y la
# operación tira error (que sí podemos manejar) en vez de quedar trabada.
_connect_args: dict = {}
if settings.DATABASE_URL.startswith("postgresql"):
    _connect_args = {
        "connect_timeout": 10,
        "keepalives": 1,
        "keepalives_idle": 30,
        "keepalives_interval": 10,
        "keepalives_count": 5,
    }

engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,  # evita conexiones muertas al tomarlas del pool
    pool_recycle=1800,  # recicla conexiones cada 30 min (antes de que el pooler las corte)
    echo=settings.DEBUG,
    connect_args=_connect_args,
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
