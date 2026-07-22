"""Gestión personal: cada vendedor ve solo lo suyo (bandeja, presupuestos y
solicitudes); el admin ve todo. Oportunidades se filtran con solo_mias."""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import app.main  # noqa: F401 - registra todos los modelos en Base.metadata
from app.api.deps import get_current_user
from app.db.base import Base
from app.db.models.clientes import Cliente
from app.db.models.mails import DireccionMail, Mail
from app.db.models.oportunidades import EstadoOportunidad, Oportunidad
from app.db.models.presupuestos import Presupuesto
from app.db.models.solicitudes_compras import EstadoSolicitud, SolicitudCompras
from app.db.models.usuarios import RolUsuario, Usuario
from app.db.session import get_db
from app.main import app

engine = create_engine(
    "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
)
TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

# Usuario "logueado" mutable para simular distintas sesiones dentro de un test.
_sesion: dict[str, Usuario] = {}


def _login(user_id: int, rol: RolUsuario = RolUsuario.vendedor) -> None:
    _sesion["user"] = Usuario(id=user_id, email="x@x.com", nombre="X", activo=True, rol=rol)


@pytest.fixture()
def client() -> Iterator[TestClient]:
    Base.metadata.create_all(bind=engine)
    seed = TestingSessionLocal()
    seed.add(Cliente(id=1, razon_social="C1", activo=True))
    # Ana (1) y Beto (2) son vendedores; cada uno con su oportunidad.
    seed.add_all(
        [
            Oportunidad(id=1, cliente_id=1, vendedor_id=1, estado=EstadoOportunidad.nueva),
            Oportunidad(id=2, cliente_id=1, vendedor_id=2, estado=EstadoOportunidad.nueva),
            Mail(id=1, oportunidad_id=1, direccion=DireccionMail.entrante, asunto="de Ana"),
            Mail(id=2, oportunidad_id=2, direccion=DireccionMail.entrante, asunto="de Beto"),
            Presupuesto(id=1, oportunidad_id=1, codigo="P-1"),
            Presupuesto(id=2, oportunidad_id=2, codigo="P-2"),
            SolicitudCompras(
                id=1, oportunidad_id=1, solicitante_id=1, requerimiento="x",
                estado=EstadoSolicitud.enviada,
            ),
            SolicitudCompras(
                id=2, oportunidad_id=2, solicitante_id=2, requerimiento="y",
                estado=EstadoSolicitud.enviada,
            ),
        ]
    )
    seed.commit()
    seed.close()

    def override_get_db() -> Iterator[Session]:
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = lambda: _sesion["user"]
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=engine)


def _ids(resp) -> list[int]:  # noqa: ANN001
    return sorted(r["id"] for r in resp.json())


def test_todos_ven_todo(client: TestClient) -> None:
    # Gestión compartida: sin filtro, cualquier usuario ve todo (propio y ajeno).
    for uid in (1, 2):
        _login(uid)
        assert _ids(client.get("/api/v1/mails")) == [1, 2]
        assert _ids(client.get("/api/v1/presupuestos")) == [1, 2]
        assert _ids(client.get("/api/v1/solicitudes")) == [1, 2]


def test_admin_ve_todo(client: TestClient) -> None:
    _login(3, RolUsuario.admin)
    assert _ids(client.get("/api/v1/mails")) == [1, 2]
    assert _ids(client.get("/api/v1/presupuestos")) == [1, 2]
    assert _ids(client.get("/api/v1/solicitudes")) == [1, 2]


def test_oportunidades_toggle_mias(client: TestClient) -> None:
    _login(1)  # Ana
    # Sin el flag: ve todas (pipeline compartido).
    assert _ids(client.get("/api/v1/oportunidades")) == [1, 2]
    # Con solo_mias: solo las suyas.
    assert _ids(client.get("/api/v1/oportunidades", params={"solo_mias": True})) == [1]


def test_todos_acceden_por_id(client: TestClient) -> None:
    _login(2)  # Beto abre por URL/id lo de Ana (id 1): ahora permitido (compartido)
    assert client.get("/api/v1/presupuestos/1").status_code == 200
    assert client.patch("/api/v1/presupuestos/1", json={"estado": "aceptado"}).status_code == 200
    assert client.get("/api/v1/mails/1").status_code == 200
    assert client.get("/api/v1/mails/1/hilo").status_code == 200
    assert client.get("/api/v1/solicitudes/1").status_code == 200


def test_admin_ve_perfil_de_un_usuario(client: TestClient) -> None:
    _login(3, RolUsuario.admin)  # admin filtra por vendedor (perfil)
    assert _ids(client.get("/api/v1/oportunidades", params={"usuario_id": 2})) == [2]
    assert _ids(client.get("/api/v1/presupuestos", params={"usuario_id": 2})) == [2]
    assert _ids(client.get("/api/v1/solicitudes", params={"usuario_id": 1})) == [1]
    assert _ids(client.get("/api/v1/mails", params={"usuario_id": 1})) == [1]


def test_cualquiera_filtra_por_usuario(client: TestClient) -> None:
    _login(1)  # Ana (no admin) puede filtrar por otro usuario: todo es compartido
    assert _ids(client.get("/api/v1/presupuestos", params={"usuario_id": 2})) == [2]
    assert _ids(client.get("/api/v1/solicitudes", params={"usuario_id": 2})) == [2]
    assert _ids(client.get("/api/v1/mails", params={"usuario_id": 2})) == [2]
    assert _ids(client.get("/api/v1/presupuestos", params={"usuario_id": 1})) == [1]


def test_owner_y_admin_si_acceden_por_id(client: TestClient) -> None:
    _login(1)  # Ana, dueña
    assert client.get("/api/v1/presupuestos/1").status_code == 200
    assert client.get("/api/v1/mails/1").status_code == 200

    _login(3, RolUsuario.admin)  # admin ve todo
    assert client.get("/api/v1/presupuestos/1").status_code == 200
    assert client.get("/api/v1/mails/2").status_code == 200
