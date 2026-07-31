"""Tests de la sincronización GBP -> CRM (lógica pura, sin red)."""

from collections.abc import Iterator

import pytest
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.db.models.clientes import Cliente
from app.db.models.configuracion import Configuracion
from app.db.models.contactos_cliente import ContactoCliente
from app.db.models.dominios_cliente import DominioCliente
from app.integrations.gbp.client import parse_tables
from app.services.gbp_sync import (
    armar_direccion,
    es_dominio_publico,
    get_watermark,
    normalizar_cuit,
    set_watermark,
    sincronizar_clientes,
    sincronizar_incremental,
    split_emails,
)

engine = create_engine(
    "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
)
TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

_TABLES = [
    Cliente.__table__,
    ContactoCliente.__table__,
    DominioCliente.__table__,
    Configuracion.__table__,
]


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
    def __init__(self, rows: list[dict]) -> None:
        self.rows = rows

    def iter_pages(self) -> Iterator[list[dict]]:
        return iter([self.rows])  # una sola página

    def iter_customers(self) -> Iterator[dict]:
        return iter(self.rows)

    def fetch_customer(self, cust_id: int) -> dict | None:
        return next((r for r in self.rows if str(r.get("cust_id")) == str(cust_id)), None)


# --- helpers puros ---
def test_normalizar_cuit() -> None:
    assert normalizar_cuit("30586999512") == "30-58699951-2"
    assert normalizar_cuit("30-58699951-2") == "30-58699951-2"
    assert normalizar_cuit("123") is None
    assert normalizar_cuit(None) is None


def test_split_emails() -> None:
    assert split_emails("a@x.com, b@y.com; c@z.com") == ["a@x.com", "b@y.com", "c@z.com"]
    assert split_emails("A@X.COM  a@x.com") == ["a@x.com"]  # dedup + lowercase
    assert split_emails("no-es-mail") == []
    assert split_emails(None) == []


def test_es_dominio_publico() -> None:
    assert es_dominio_publico("gmail.com")
    assert es_dominio_publico("HOTMAIL.COM")
    assert not es_dominio_publico("aeropuerto.com.ar")


def test_armar_direccion() -> None:
    assert armar_direccion("Calle 1", "CABA", "1000", "Bs As") == "Calle 1, CABA (1000), Bs As"
    assert armar_direccion("Calle 1", None, None, None) == "Calle 1"
    assert armar_direccion(None, None, None, None) is None


def test_parse_tables_newdataset() -> None:
    xml = (
        "<NewDataSet>"
        "<Table><cust_id>1</cust_id><cust_name>ACME</cust_name></Table>"
        "<Table><cust_id>2</cust_id><cust_name>BENCEN</cust_name></Table>"
        "</NewDataSet>"
    )
    filas = parse_tables(xml)
    assert [f["cust_name"] for f in filas] == ["ACME", "BENCEN"]


# --- sync end to end (con ERP falso) ---
def _rows() -> list[dict]:
    return [
        {  # Gubernamental, con dominio corporativo + gmail (público)
            "ck_id": "17", "cust_id": "284883", "cust_name": "ASOC AAA",
            "cust_taxNumber": "30-58699951-2",
            "cust_email": "compras@aeropuerto.com.ar, juan@gmail.com",
            "cust_address": "Calle 1", "cust_city": "CABA", "cust_zip": "1000",
            "cust_phone1": "011-4000-0000",
        },
        {  # Corporativo
            "ck_id": "16", "cust_id": "100", "cust_name": "EMPRESA SA",
            "cust_taxNumber": "30-11111111-1", "cust_email": "info@empresa.com.ar",
        },
        {  # tipo NO buscado -> se ignora por completo
            "ck_id": "5", "cust_id": "999", "cust_name": "OTRO",
            "cust_taxNumber": "30-22222222-2",
        },
        {  # Gremio, CUIT inválido -> omitido
            "ck_id": "1", "cust_id": "101", "cust_name": "SIN CUIT",
            "cust_taxNumber": "xx", "cust_email": "a@b.com",
        },
        {  # Corporativo, CUIT duplicado del row 2 -> omitido
            "ck_id": "16", "cust_id": "102", "cust_name": "DUP",
            "cust_taxNumber": "30111111111",
        },
    ]


def test_sync_crea_filtra_y_deduplica(db: Session) -> None:
    rep = sincronizar_clientes(db, FakeERP(_rows()))

    assert rep.procesados == 4  # ck_id 17,16,1,16 (el 5 se ignora)
    assert rep.creados == 2
    assert rep.omitidos_sin_cuit == 1
    assert rep.omitidos_existente == 1  # el duplicado intra-corrida

    # El gubernamental quedó bien mapeado.
    gub = db.scalar(select(Cliente).where(Cliente.numero_cliente == "284883"))
    assert gub is not None
    assert gub.tipo == "Gubernamental"
    assert gub.cuit == "30-58699951-2"
    assert gub.direccion_facturacion == "Calle 1, CABA (1000)"
    assert gub.telefono == "011-4000-0000"

    # 3 contactos en total (2 del gubernamental + 1 del corporativo).
    assert db.scalar(select(func.count()).select_from(ContactoCliente)) == 3
    # Solo 2 dominios: aeropuerto.com.ar y empresa.com.ar (gmail se omite).
    doms = {d.dominio for d in db.scalars(select(DominioCliente))}
    assert doms == {"aeropuerto.com.ar", "empresa.com.ar"}
    # El primer dominio del cliente queda como principal.
    aero = db.scalar(select(DominioCliente).where(DominioCliente.dominio == "aeropuerto.com.ar"))
    assert aero.es_principal_dominio is True


def test_sync_no_pisa_existente_por_cuit(db: Session) -> None:
    db.add(Cliente(razon_social="YA EXISTE", cuit="30-58699951-2", activo=True))
    db.commit()

    rep = sincronizar_clientes(db, FakeERP(_rows()))
    # El gubernamental ya existía (mismo CUIT) -> no se recrea.
    assert rep.omitidos_existente == 2  # el pre-existente + el duplicado intra-corrida
    conteo = db.scalar(
        select(func.count()).select_from(Cliente).where(Cliente.cuit == "30-58699951-2")
    )
    assert conteo == 1


def test_sync_ignora_email_del_dominio_propio(db: Session) -> None:
    rows = [
        {
            "ck_id": "16", "cust_id": "700", "cust_name": "CON EMAIL INTERNO",
            "cust_taxNumber": "30-70000000-7",
            "cust_email": "vendedor@argentinacolor.com, compras@clientereal.com.ar",
        },
    ]
    sincronizar_clientes(db, FakeERP(rows))
    doms = {d.dominio for d in db.scalars(select(DominioCliente))}
    # NO se registra el dominio propio; sí el del cliente real.
    assert "argentinacolor.com" not in doms
    assert "clientereal.com.ar" in doms


def test_sync_dry_run_no_escribe(db: Session) -> None:
    rep = sincronizar_clientes(db, FakeERP(_rows()), dry_run=True)
    assert rep.creados == 2
    assert db.scalar(select(func.count()).select_from(Cliente)) == 0


def test_sync_incremental_camina_ids_desde_watermark(db: Session) -> None:
    # Watermark en 100: solo mira ids nuevos (>100), 1 por 1, hasta el final.
    set_watermark(db, 100)
    rows = [
        {"cust_id": "101", "ck_id": "16", "cust_name": "NUEVO CORP",
         "cust_taxNumber": "30-11111111-8"},
        {"cust_id": "102", "ck_id": "5", "cust_name": "ML CLIENTE",  # tipo NO filtrado
         "cust_taxNumber": "30-22222222-7"},
        {"cust_id": "103", "ck_id": "1", "cust_name": "NUEVO GREMIO",
         "cust_taxNumber": "30-33333333-6"},
    ]
    rep = sincronizar_incremental(db, FakeERP(rows), max_misses=5)

    assert rep.creados == 2  # 101 y 103; 102 se ignora por tipo
    nombres = set(db.scalars(select(Cliente.razon_social)))
    assert {"NUEVO CORP", "NUEVO GREMIO"} <= nombres
    assert "ML CLIENTE" not in nombres
    # El watermark avanza al último id existente encontrado.
    assert get_watermark(db) == 103


def test_sync_incremental_sin_watermark_hace_full(db: Session) -> None:
    # Sin watermark previo -> cae al scan completo (y lo deja seteado).
    rep = sincronizar_incremental(db, FakeERP(_rows()))
    assert rep.creados == 2
    assert get_watermark(db) is not None  # el full dejó el baseline
