"""Test de la auto-ingesta de respuestas de Compras desde el hilo de Gmail."""

from collections.abc import Iterator

import pytest
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.db.models.clientes import Cliente
from app.db.models.notificaciones import Notificacion
from app.db.models.oportunidades import EstadoOportunidad, Oportunidad
from app.db.models.respuestas_compras import RespuestaCompras
from app.db.models.solicitudes_compras import EstadoSolicitud, SolicitudCompras
from app.db.models.usuarios import Usuario
from app.integrations.ai.base import AIProvider, QuoteDraft, QuoteItem

engine = create_engine(
    "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
)
TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class FakeAI(AIProvider):
    def extract_email_data(self, email_text, images=None, documents=None):  # noqa: ANN001
        raise NotImplementedError

    def draft_quote(self, compras_response: str) -> QuoteDraft:
        return QuoteDraft(
            items=[QuoteItem(descripcion="Pigmento rojo", cantidad=10, precio_unitario=120)],
            notas="Entrega 10 días.",
        )

    def summarize_thread(self, messages):  # noqa: ANN001
        return ""


class FakeGmailClient:
    """Simula el hilo: primer mensaje del vendedor, luego la respuesta de Compras."""

    def __init__(self, refresh_token=None):  # noqa: ANN001
        pass

    def get_thread(self, thread_id):  # noqa: ANN001
        return [
            {"message_id": "m-vendedor", "de": "v@argentinacolor.com", "cuerpo": "Solicito"},
            {"message_id": "m-compras", "de": "compras@arg.com", "cuerpo": "Pigmento x10"},
        ]


@pytest.fixture()
def db() -> Iterator[Session]:
    tables = [
        Usuario.__table__,
        Cliente.__table__,
        Oportunidad.__table__,
        SolicitudCompras.__table__,
        RespuestaCompras.__table__,
        Notificacion.__table__,
    ]
    Base.metadata.create_all(bind=engine, tables=tables)
    session = TestingSessionLocal()
    session.add(
        Usuario(
            id=1,
            email="v@argentinacolor.com",
            nombre="Vendedor",
            activo=True,
            gmail_refresh_token="enc-token",
        )
    )
    session.add(Cliente(id=1, razon_social="BENCEN S.A.", activo=True))
    session.add(Oportunidad(id=1, cliente_id=1, vendedor_id=1, estado=EstadoOportunidad.en_compras))
    session.add(
        SolicitudCompras(
            id=1,
            oportunidad_id=1,
            solicitante_id=1,
            requerimiento="10 kg pigmento",
            gmail_thread_id="hilo-1",
            estado=EstadoSolicitud.enviada,
        )
    )
    session.commit()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine, tables=tables)


def test_ingiere_respuesta_de_compras_y_dedup(db: Session, monkeypatch) -> None:  # noqa: ANN001
    monkeypatch.setattr("app.core.crypto.decrypt", lambda _v: "tok")
    monkeypatch.setattr("app.integrations.gmail.client.GmailClient", FakeGmailClient)

    from app.services.compras_ingest import ingerir_respuestas_compras

    creadas = ingerir_respuestas_compras(db, FakeAI())
    assert creadas == 1

    resp = db.scalars(select(RespuestaCompras)).all()
    assert len(resp) == 1
    assert resp[0].gmail_message_id == "m-compras"  # no tomó el mensaje del vendedor
    assert resp[0].datos_parseados_ia["items"][0]["descripcion"] == "Pigmento rojo"

    sol = db.get(SolicitudCompras, 1)
    assert sol.estado == EstadoSolicitud.respondida
    # La oportunidad avanzó a "cotizado por compras".
    assert db.get(Oportunidad, 1).estado == EstadoOportunidad.cotizado_compras
    assert db.scalar(select(func.count()).select_from(Notificacion)) == 1

    # Segunda corrida: dedup por gmail_message_id -> no crea otra.
    assert ingerir_respuestas_compras(db, FakeAI()) == 0
    assert db.scalar(select(func.count()).select_from(RespuestaCompras)) == 1
