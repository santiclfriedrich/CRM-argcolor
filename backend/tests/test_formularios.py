"""Test del autocompletado de formularios con IA (con un proveedor de IA fake)."""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.deps import get_ai, get_current_user
from app.db.base import Base
from app.db.models.configuracion import Configuracion
from app.db.models.usuarios import Usuario
from app.db.session import get_db
from app.integrations.ai.base import (
    CampoFormulario,
    DocumentPart,
    FormularioCompletado,
)
from app.main import app

engine = create_engine(
    "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
)
TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
_TABLES = [Usuario.__table__, Configuracion.__table__]


class FakeAI:
    """Devuelve un mapeo fijo usando el perfil recibido (sin llamar a Gemini)."""

    def completar_formulario(
        self, perfil: dict, document: DocumentPart
    ) -> FormularioCompletado:
        return FormularioCompletado(
            campos=[
                CampoFormulario(etiqueta="Razón social", valor=perfil["razon_social"]),
                CampoFormulario(etiqueta="CUIT", valor=perfil["cuit"]),
                CampoFormulario(etiqueta="Teléfono", valor="", encontrado=False),
            ],
            notas="Adjuntar constancia de CBU.",
        )


@pytest.fixture()
def client() -> Iterator[TestClient]:
    Base.metadata.create_all(bind=engine, tables=_TABLES)

    def override_get_db() -> Iterator[Session]:
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    fake_user = Usuario(id=1, email="v@argentinacolor.com", nombre="V", activo=True)
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = lambda: fake_user
    app.dependency_overrides[get_ai] = lambda: FakeAI()
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=engine, tables=_TABLES)


def test_completar_formulario_usa_el_perfil(client: TestClient) -> None:
    files = {"archivo": ("form.pdf", b"%PDF-1.4 fake", "application/pdf")}
    r = client.post("/api/v1/formularios/completar", files=files)
    assert r.status_code == 200, r.text
    data = r.json()
    por_etiqueta = {c["etiqueta"]: c for c in data["campos"]}
    assert por_etiqueta["Razón social"]["valor"] == "MERCADOS DIGITALES S.A."
    assert por_etiqueta["CUIT"]["valor"] == "30-71737169-7"
    assert por_etiqueta["Teléfono"]["encontrado"] is False
    assert data["notas"]


def test_completar_formulario_rechaza_no_pdf(client: TestClient) -> None:
    files = {"archivo": ("form.txt", b"hola", "text/plain")}
    r = client.post("/api/v1/formularios/completar", files=files)
    assert r.status_code == 400
