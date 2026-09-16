"""Tests del alta de clientes en GBP desde el CRM (sin red; ERP falso)."""

from collections.abc import Iterator
from typing import Any

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.db.models.clientes import Cliente
from app.db.models.contactos_cliente import ContactoCliente
from app.services.gbp_alta import crear_cliente_en_gbp, cuit_valido

engine = create_engine(
    "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
)
TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

_TABLES = [Cliente.__table__, ContactoCliente.__table__]

CUIT_OK = "20-12345678-6"  # dígito verificador válido


@pytest.fixture()
def db() -> Iterator[Session]:
    Base.metadata.create_all(bind=engine, tables=_TABLES)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine, tables=_TABLES)


class FakeERP:
    def __init__(self, existentes: list[dict] | None = None, nuevo_id: str = "500123") -> None:
        self.existentes = existentes or []
        self.nuevo_id = nuevo_id
        self.creado: dict[str, Any] | None = None
        self.clase: tuple[int, int] | None = None

    def buscar_por_cuit(self, cuit: str) -> list[dict[str, str]]:
        return list(self.existentes)

    def crear_cliente(self, **kwargs: Any) -> str:
        self.creado = kwargs
        return self.nuevo_id

    def set_clase_cliente(self, cust_id: int, ck_id: int) -> list[dict[str, str]]:
        self.clase = (cust_id, ck_id)
        return [{"cust_id": str(cust_id), "ck_id": str(ck_id)}]


def _cliente(db: Session, **kw: Any) -> Cliente:
    base = {"razon_social": "ACME SA", "cuit": CUIT_OK, "tipo": "Corporativo"}
    base.update(kw)
    c = Cliente(**base)
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


def test_cuit_valido() -> None:
    assert cuit_valido(CUIT_OK)
    assert cuit_valido("20123456786")
    assert not cuit_valido("20-12345678-0")  # verificador incorrecto
    assert not cuit_valido("123")


def test_alta_ok_setea_clase_y_numero_cliente(db: Session) -> None:
    cliente = _cliente(db)
    erp = FakeERP(nuevo_id="500123")
    r = crear_cliente_en_gbp(db, erp, cliente, state_id="54019")
    assert r == {"cust_id": 500123, "dedup": False, "clase_ok": True}
    assert cliente.numero_cliente == "500123"
    # CUIT con guiones + tipo doc CUIT + clase Corporativo (16).
    assert erp.creado["taxnumber"] == CUIT_OK
    assert erp.creado["taxnumbertype"] == "80"
    assert erp.creado["state"] == "54019"
    assert erp.clase == (500123, 16)


def test_dedup_no_recrea(db: Session) -> None:
    cliente = _cliente(db)
    erp = FakeERP(existentes=[{"cust_id": "433434"}])
    r = crear_cliente_en_gbp(db, erp, cliente, state_id="54019")
    assert r["dedup"] is True
    assert r["cust_id"] == 433434
    assert cliente.numero_cliente == "433434"
    assert erp.creado is None  # no se llamó al alta


def test_cuit_invalido_lanza(db: Session) -> None:
    cliente = _cliente(db, cuit="20-12345678-0")
    with pytest.raises(ValueError, match="CUIT"):
        crear_cliente_en_gbp(db, FakeERP(), cliente, state_id="54019")


def test_gbp_rechaza_alta_lanza(db: Session) -> None:
    cliente = _cliente(db)
    with pytest.raises(ValueError, match="rechaz"):
        crear_cliente_en_gbp(db, FakeERP(nuevo_id="-4"), cliente, state_id="54019")
    assert cliente.numero_cliente is None  # no se guardó vínculo
