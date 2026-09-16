"""Tests del CRUD de oportunidades (SQLite en memoria, sin login real)."""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.deps import get_current_user
from app.db.base import Base
from app.db.models.adjuntos import Adjunto
from app.db.models.clientes import Cliente
from app.db.models.contactos_cliente import ContactoCliente
from app.db.models.mails import Mail
from app.db.models.mails_descartados import MailDescartado
from app.db.models.notificaciones import Notificacion
from app.db.models.oportunidades import Oportunidad
from app.db.models.presupuesto_items import PresupuestoItem
from app.db.models.presupuestos import Presupuesto
from app.db.models.recordatorios import Recordatorio
from app.db.models.respuestas_compras import RespuestaCompras
from app.db.models.solicitudes_compras import SolicitudCompras
from app.db.models.tareas import Tarea
from app.db.models.usuarios import Usuario
from app.db.session import get_db
from app.main import app

engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


@pytest.fixture()
def client() -> Iterator[TestClient]:
    tables = [
        Usuario.__table__,
        Cliente.__table__,
        ContactoCliente.__table__,
        Oportunidad.__table__,
        Mail.__table__,
        MailDescartado.__table__,
        Adjunto.__table__,
        SolicitudCompras.__table__,
        RespuestaCompras.__table__,
        Presupuesto.__table__,
        PresupuestoItem.__table__,
        Recordatorio.__table__,
        Notificacion.__table__,
        Tarea.__table__,
    ]
    Base.metadata.create_all(bind=engine, tables=tables)

    def override_get_db() -> Iterator[Session]:
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    # Sembramos un vendedor y un cliente para enlazar la oportunidad.
    with TestingSessionLocal() as seed:
        seed.add(Usuario(id=1, email="v@argentinacolor.com", nombre="Vendedor Uno", activo=True))
        seed.add(Cliente(id=1, razon_social="BENCEN S.A.", activo=True))
        seed.commit()

    fake_user = Usuario(id=1, email="v@argentinacolor.com", nombre="Vendedor Uno", activo=True)

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = lambda: fake_user
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=engine, tables=tables)


def test_create_y_listado_con_nombres(client: TestClient) -> None:
    resp = client.post(
        "/api/v1/oportunidades",
        json={"cliente_id": 1, "vendedor_id": 1, "fuente": "manual"},
    )
    assert resp.status_code == 201
    creada = resp.json()
    assert creada["estado"] == "nueva"

    # El listado trae los nombres anidados, no solo IDs.
    items = client.get("/api/v1/oportunidades").json()
    assert len(items) == 1
    assert items[0]["cliente"]["razon_social"] == "BENCEN S.A."
    assert items[0]["vendedor"]["nombre"] == "Vendedor Uno"


def test_patch_estado_actualiza_ultimo_movimiento(client: TestClient) -> None:
    op_id = client.post("/api/v1/oportunidades", json={"cliente_id": 1}).json()["id"]
    antes = client.get(f"/api/v1/oportunidades/{op_id}").json()["fecha_ultimo_movimiento"]

    resp = client.patch(f"/api/v1/oportunidades/{op_id}", json={"estado": "en_compras"})
    assert resp.status_code == 200
    despues = resp.json()
    assert despues["estado"] == "en_compras"
    assert despues["fecha_ultimo_movimiento"] >= antes


def test_filtro_por_estado(client: TestClient) -> None:
    client.post("/api/v1/oportunidades", json={"cliente_id": 1, "estado": "nueva"})
    client.post("/api/v1/oportunidades", json={"cliente_id": 1, "estado": "finalizado"})

    finalizadas = client.get("/api/v1/oportunidades", params={"estado": "finalizado"}).json()
    assert len(finalizadas) == 1
    assert finalizadas[0]["estado"] == "finalizado"


def test_get_404(client: TestClient) -> None:
    assert client.get("/api/v1/oportunidades/999").status_code == 404


def _sembrar_usuario2() -> Usuario:
    with TestingSessionLocal() as db:
        if not db.get(Usuario, 2):
            db.add(Usuario(id=2, email="v2@argentinacolor.com", nombre="Vendedor Dos", activo=True))
            db.commit()
    return Usuario(id=2, email="v2@argentinacolor.com", nombre="Vendedor Dos", activo=True)


def test_transferir_aceptar(client: TestClient) -> None:
    u2 = _sembrar_usuario2()
    op_id = client.post(
        "/api/v1/oportunidades", json={"cliente_id": 1, "vendedor_id": 1}
    ).json()["id"]

    # Usuario 1 la transfiere a usuario 2.
    r = client.post(f"/api/v1/oportunidades/{op_id}/transferir", json={"a_usuario_id": 2})
    assert r.status_code == 200
    assert r.json()["transferencia_para"]["id"] == 2

    # Sale de las "Mías" del que transfiere (usuario 1).
    mias_u1 = client.get("/api/v1/oportunidades", params={"solo_mias": True}).json()
    assert all(o["id"] != op_id for o in mias_u1)

    # Como usuario 2: la ve en pendientes y la acepta.
    app.dependency_overrides[get_current_user] = lambda: u2
    pend = client.get("/api/v1/oportunidades/transferencias-pendientes").json()
    assert [o["id"] for o in pend] == [op_id]

    r2 = client.post(f"/api/v1/oportunidades/{op_id}/transferir/aceptar")
    assert r2.status_code == 200
    assert r2.json()["vendedor"]["id"] == 2
    assert r2.json()["transferencia_para"] is None

    # Ahora es de las "Mías" de usuario 2.
    mias_u2 = client.get("/api/v1/oportunidades", params={"solo_mias": True}).json()
    assert any(o["id"] == op_id for o in mias_u2)


def test_transferir_rechazar_vuelve_al_vendedor(client: TestClient) -> None:
    u2 = _sembrar_usuario2()
    op_id = client.post(
        "/api/v1/oportunidades", json={"cliente_id": 1, "vendedor_id": 1}
    ).json()["id"]
    client.post(f"/api/v1/oportunidades/{op_id}/transferir", json={"a_usuario_id": 2})

    app.dependency_overrides[get_current_user] = lambda: u2
    r = client.post(f"/api/v1/oportunidades/{op_id}/transferir/rechazar")
    assert r.status_code == 200
    assert r.json()["transferencia_para"] is None
    assert r.json()["vendedor"]["id"] == 1  # sigue siendo del vendedor original

    # Usuario 2 ya no la tiene pendiente.
    assert client.get("/api/v1/oportunidades/transferencias-pendientes").json() == []


def test_transferir_a_uno_mismo_rechazado(client: TestClient) -> None:
    op_id = client.post(
        "/api/v1/oportunidades", json={"cliente_id": 1, "vendedor_id": 1}
    ).json()["id"]
    r = client.post(f"/api/v1/oportunidades/{op_id}/transferir", json={"a_usuario_id": 1})
    assert r.status_code == 400


def _crear_propuesta(cuerpo: str = "Necesito 100kg", gmail_id: str = "gm-x") -> int:
    """Crea una oportunidad pendiente de revisión con su mail original."""
    from app.db.models.mails import DireccionMail, Mail

    with TestingSessionLocal() as db:
        op = Oportunidad(
            cliente_id=1,
            vendedor_id=1,
            fuente="mail",
            asunto="Pedido de prueba",
            requerimiento="Producto: Pigmento\nCantidad: 100kg",
            pendiente_revision=True,
        )
        db.add(op)
        db.flush()
        db.add(
            Mail(
                oportunidad_id=op.id,
                gmail_message_id=gmail_id,
                direccion=DireccionMail.entrante,
                de="juan@bencen.com.ar",
                asunto="Pedido de prueba",
                cuerpo=cuerpo,
            )
        )
        db.commit()
        return op.id


def test_propuesta_no_aparece_en_listado_pero_si_en_propuestas(client: TestClient) -> None:
    op_id = _crear_propuesta(cuerpo="Hola, necesito cotizar 100kg de pigmento")

    # No está en el listado normal…
    lista = client.get("/api/v1/oportunidades").json()
    assert all(o["id"] != op_id for o in lista)

    # …pero sí en propuestas, con el mail y el requerimiento.
    props = client.get("/api/v1/oportunidades/propuestas").json()
    p = next((x for x in props if x["id"] == op_id), None)
    assert p is not None
    assert "100kg" in (p["mail_cuerpo"] or "")
    assert "Pigmento" in (p["requerimiento"] or "")


def test_propuesta_aceptar_entra_al_pipeline(client: TestClient) -> None:
    op_id = _crear_propuesta(gmail_id="gm-aceptar")
    assert client.post(f"/api/v1/oportunidades/{op_id}/propuesta/aceptar").status_code == 200

    lista = client.get("/api/v1/oportunidades").json()
    assert any(o["id"] == op_id for o in lista)
    assert client.get("/api/v1/oportunidades/propuestas").json() == []


def test_propuesta_rechazar_elimina_y_descarta_mail(client: TestClient) -> None:
    from sqlalchemy import func, select

    from app.db.models.mails_descartados import MailDescartado

    op_id = _crear_propuesta(gmail_id="gm-rechazar")
    assert client.post(f"/api/v1/oportunidades/{op_id}/propuesta/rechazar").status_code == 204

    with TestingSessionLocal() as db:
        assert db.get(Oportunidad, op_id) is None
        # El mail queda descartado para que el polling no lo vuelva a ingresar.
        n = db.scalar(
            select(func.count())
            .select_from(MailDescartado)
            .where(MailDescartado.gmail_message_id == "gm-rechazar")
        )
        assert n == 1


def test_eliminar_multiples(client: TestClient) -> None:
    a = client.post("/api/v1/oportunidades", json={"cliente_id": 1}).json()["id"]
    b = client.post("/api/v1/oportunidades", json={"cliente_id": 1}).json()["id"]
    c = client.post("/api/v1/oportunidades", json={"cliente_id": 1}).json()["id"]

    resp = client.post("/api/v1/oportunidades/eliminar-multiples", json={"ids": [a, b]})
    assert resp.status_code == 200
    assert resp.json()["eliminadas"] == 2

    # a y b borradas; c sigue.
    assert client.get(f"/api/v1/oportunidades/{a}").status_code == 404
    assert client.get(f"/api/v1/oportunidades/{b}").status_code == 404
    assert client.get(f"/api/v1/oportunidades/{c}").status_code == 200


def test_campos_seguimiento_y_comentarios(client: TestClient) -> None:
    op = client.post(
        "/api/v1/oportunidades",
        json={
            "cliente_id": 1,
            "asunto": "Pigmento urgente obra La Plata",
            "valor_estimado": 15000.5,
            "fecha_limite": "2026-08-01",
        },
    ).json()
    assert op["asunto"] == "Pigmento urgente obra La Plata"
    assert float(op["valor_estimado"]) == 15000.5
    assert op["fecha_limite"] == "2026-08-01"
    assert op["comentarios"] == []

    # Agregar un comentario a la bitácora.
    resp = client.post(
        f"/api/v1/oportunidades/{op['id']}/comentarios",
        json={"texto": "Llamé al cliente, espera confirmación."},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["comentarios"]) == 1
    assert data["comentarios"][0]["texto"] == "Llamé al cliente, espera confirmación."
    assert data["comentarios"][0]["autor"] == "Vendedor Uno"


def test_filtro_por_fecha(client: TestClient) -> None:
    from datetime import date, timedelta

    client.post("/api/v1/oportunidades", json={"cliente_id": 1})
    hoy = date.today()

    incluidas = client.get("/api/v1/oportunidades", params={"desde": str(hoy)}).json()
    assert len(incluidas) == 1
    # Rango que termina ayer no incluye la de hoy.
    hasta_ayer = {"hasta": str(hoy - timedelta(days=1))}
    ayer = client.get("/api/v1/oportunidades", params=hasta_ayer).json()
    assert len(ayer) == 0


def test_seguimiento_genera_avisos_y_dedupe(client: TestClient) -> None:
    from datetime import date, datetime, timedelta, timezone

    op_id = client.post(
        "/api/v1/oportunidades", json={"cliente_id": 1, "vendedor_id": 1}
    ).json()["id"]

    # Backdate: venció ayer y no tiene movimiento hace 5 días.
    with TestingSessionLocal() as db:
        o = db.get(Oportunidad, op_id)
        o.fecha_limite = date.today() - timedelta(days=1)
        o.fecha_ultimo_movimiento = datetime.now(timezone.utc) - timedelta(days=5)
        db.commit()

    creadas = client.post("/api/v1/notificaciones/generar-seguimiento").json()["creadas"]
    assert creadas == 2  # vencida + sin avance

    # Idempotente en el mismo día: no duplica.
    creadas2 = client.post("/api/v1/notificaciones/generar-seguimiento").json()["creadas"]
    assert creadas2 == 0

    # Le aparecen al vendedor en la campana.
    notis = client.get("/api/v1/notificaciones").json()
    assert len(notis) == 2
    assert all(n["link"] == f"/oportunidades?op={op_id}" for n in notis)


def test_seguimiento_ignora_cerradas_y_al_dia(client: TestClient) -> None:
    # Ganada (terminal) + reciente => no genera avisos.
    client.post(
        "/api/v1/oportunidades",
        json={"cliente_id": 1, "vendedor_id": 1, "estado": "finalizado"},
    )
    client.post("/api/v1/oportunidades", json={"cliente_id": 1, "vendedor_id": 1})
    creadas = client.post("/api/v1/notificaciones/generar-seguimiento").json()["creadas"]
    assert creadas == 0


def test_busqueda_global(client: TestClient) -> None:
    with TestingSessionLocal() as db:
        db.add(
            ContactoCliente(id=1, cliente_id=1, nombre="Juan Pérez", email="juan@bencen.com.ar")
        )
        db.commit()
    client.post(
        "/api/v1/oportunidades",
        json={"cliente_id": 1, "asunto": "Cotización de solventes"},
    )

    porCliente = client.get("/api/v1/search", params={"q": "BENCEN"}).json()
    assert any(c["razon_social"] == "BENCEN S.A." for c in porCliente["clientes"])

    porContacto = client.get("/api/v1/search", params={"q": "Juan"}).json()
    assert any(ct["nombre"] == "Juan Pérez" for ct in porContacto["contactos"])

    porOpp = client.get("/api/v1/search", params={"q": "solventes"}).json()
    assert any("solventes" in (o["asunto"] or "").lower() for o in porOpp["oportunidades"])


def test_delete_borra_oportunidad_y_sus_mails_en_cascada(client: TestClient) -> None:
    from sqlalchemy import func, select

    from app.db.models.mails import DireccionMail

    op_id = client.post("/api/v1/oportunidades", json={"cliente_id": 1}).json()["id"]
    # La oportunidad tiene un mail con un adjunto (caso típico de la bandeja).
    with TestingSessionLocal() as db:
        mail = Mail(oportunidad_id=op_id, direccion=DireccionMail.entrante, de="x@bencen.com.ar")
        db.add(mail)
        db.flush()
        db.add(
            Adjunto(
                mail_id=mail.id,
                nombre_archivo="foto.jpg",
                path_storage="/tmp/no-existe.jpg",
            )
        )
        db.commit()

    resp = client.delete(f"/api/v1/oportunidades/{op_id}")
    assert resp.status_code == 204
    assert client.get(f"/api/v1/oportunidades/{op_id}").status_code == 404

    # Se borraron también el mail y su adjunto.
    with TestingSessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(Mail)) == 0
        assert db.scalar(select(func.count()).select_from(Adjunto)) == 0


def test_delete_404_si_no_existe(client: TestClient) -> None:
    assert client.delete("/api/v1/oportunidades/999").status_code == 404


def test_delete_marca_gmail_id_para_no_resucitar(client: TestClient) -> None:
    from sqlalchemy import select

    from app.db.models.mails import DireccionMail

    op_id = client.post("/api/v1/oportunidades", json={"cliente_id": 1}).json()["id"]
    with TestingSessionLocal() as db:
        db.add(
            Mail(
                oportunidad_id=op_id,
                direccion=DireccionMail.entrante,
                de="x@bencen.com.ar",
                gmail_message_id="gmail-123",
            )
        )
        db.commit()

    assert client.delete(f"/api/v1/oportunidades/{op_id}").status_code == 204

    # El id de Gmail queda marcado como eliminado para que el poller no lo reingese.
    with TestingSessionLocal() as db:
        desc = db.scalars(
            select(MailDescartado).where(MailDescartado.gmail_message_id == "gmail-123")
        ).first()
        assert desc is not None and desc.categoria == "eliminado_manual"


def test_limpieza_borra_propuestas_y_descartados_viejos(client: TestClient) -> None:
    """El job diario borra propuestas y descartados de más de 10 días, y deja
    intactos los recientes y las oportunidades ya aceptadas (no pendientes)."""
    from datetime import datetime, timedelta, timezone

    from sqlalchemy import select

    from app.services.limpieza import limpiar_bandeja

    ahora = datetime.now(timezone.utc)
    viejo = ahora - timedelta(days=15)
    reciente = ahora - timedelta(days=3)

    with TestingSessionLocal() as db:
        op_vieja = Oportunidad(asunto="vieja", pendiente_revision=True, fecha_creacion=viejo)
        op_nueva = Oportunidad(asunto="nueva", pendiente_revision=True, fecha_creacion=reciente)
        op_aceptada = Oportunidad(
            asunto="aceptada", pendiente_revision=False, fecha_creacion=viejo
        )
        db.add_all([op_vieja, op_nueva, op_aceptada])
        db.add(
            MailDescartado(gmail_message_id="d-viejo", categoria="no_comercial", created_at=viejo)
        )
        db.add(
            MailDescartado(
                gmail_message_id="d-nuevo", categoria="no_comercial", created_at=reciente
            )
        )
        db.commit()
        ids = {"vieja": op_vieja.id, "nueva": op_nueva.id, "aceptada": op_aceptada.id}

    with TestingSessionLocal() as db:
        assert limpiar_bandeja(db) == {"propuestas": 1, "descartados": 1, "inbox": 0}

    with TestingSessionLocal() as db:
        assert db.get(Oportunidad, ids["vieja"]) is None  # propuesta vieja: borrada
        assert db.get(Oportunidad, ids["nueva"]) is not None  # propuesta reciente: queda
        assert db.get(Oportunidad, ids["aceptada"]) is not None  # no pendiente: intacta
        restantes = list(db.scalars(select(MailDescartado.gmail_message_id)))
        assert restantes == ["d-nuevo"]


def test_ambito_se_deriva_del_tipo_de_cliente_y_filtra(client: TestClient) -> None:
    """El ámbito se deriva del tipo del cliente (Gubernamental → gubernamental),
    admite override manual, y el listado filtra por sección."""
    with TestingSessionLocal() as db:
        db.add(Cliente(id=2, razon_social="Municipio X", tipo="Gubernamental", activo=True))
        db.commit()

    # Derivación automática: cliente 1 (sin tipo) → corporativo; cliente 2 → gubernamental.
    corp = client.post(
        "/api/v1/oportunidades", json={"cliente_id": 1, "fuente": "manual"}
    ).json()
    gub = client.post(
        "/api/v1/oportunidades", json={"cliente_id": 2, "fuente": "manual"}
    ).json()
    assert corp["ambito"] == "corporativo"
    assert gub["ambito"] == "gubernamental"

    # Override manual: cliente corporativo pero se fuerza gubernamental.
    ovr = client.post(
        "/api/v1/oportunidades",
        json={"cliente_id": 1, "fuente": "manual", "ambito": "gubernamental"},
    ).json()
    assert ovr["ambito"] == "gubernamental"

    # Filtro por sección: solo las gubernamentales.
    solo_gub = client.get("/api/v1/oportunidades", params={"ambito": "gubernamental"}).json()
    ids_gub = {o["id"] for o in solo_gub}
    assert gub["id"] in ids_gub
    assert ovr["id"] in ids_gub
    assert corp["id"] not in ids_gub
    assert all(o["ambito"] == "gubernamental" for o in solo_gub)


def test_campos_gubernamentales_round_trip(client: TestClient) -> None:
    """Los campos de la sección Gubernamental se guardan y vuelven en Read y listado."""
    with TestingSessionLocal() as db:
        db.add(Cliente(id=3, razon_social="Ministerio Y", tipo="Gubernamental", activo=True))
        db.commit()

    body = {
        "cliente_id": 3,
        "fuente": "manual",
        "asunto": "Licitación 123",
        "proceso": "LP-2026-45",
        "portal": "COMPRAR",
        "apertura": "2026-09-10",
        "hr_pliego": "09:30:00",
        "hr_apertura": "11:00:00",
        "moneda": "ARS",
        "pliego": "digital",
        "empresa": "ARGCOL",
        "presupuesto_url": "https://ejemplo.com/presu/1",
    }
    r = client.post("/api/v1/oportunidades", json=body)
    assert r.status_code == 201
    o = r.json()
    assert o["ambito"] == "gubernamental"
    assert o["proceso"] == "LP-2026-45"
    assert o["portal"] == "COMPRAR"
    assert o["apertura"] == "2026-09-10"
    assert o["moneda"] == "ARS"
    assert o["pliego"] == "digital"
    assert o["empresa"] == "ARGCOL"
    assert o["presupuesto_url"] == "https://ejemplo.com/presu/1"
    assert o["hr_pliego"].startswith("09:30")
    assert o["hr_apertura"].startswith("11:00")

    items = client.get("/api/v1/oportunidades", params={"ambito": "gubernamental"}).json()
    match = next(x for x in items if x["id"] == o["id"])
    assert match["proceso"] == "LP-2026-45"
    assert match["empresa"] == "ARGCOL"


def test_seguimiento_mail_a_vendedor(client: TestClient) -> None:
    """Un admin dispara el mail de seguimiento: se envía al vendedor y se crea
    el aviso in-app."""
    from sqlalchemy import select

    from app.api.deps import get_current_admin, get_user_gmail
    from app.db.models.notificaciones import Notificacion
    from app.main import app

    enviados: list[dict] = []

    class FakeGmail:
        def send_message(self, to, subject, body, **_kw):  # noqa: ANN001, ANN201
            enviados.append({"to": to, "subject": subject, "body": body})
            return {"message_id": "x", "thread_id": None}

    with TestingSessionLocal() as db:
        db.add(Usuario(id=5, email="vend@argentinacolor.com", nombre="Vendedora", activo=True))
        db.commit()
        op = Oportunidad(asunto="Pedido X", vendedor_id=5, cliente_id=1)
        db.add(op)
        db.commit()
        op_id = op.id

    admin = Usuario(id=9, email="admin@argentinacolor.com", nombre="Admin", activo=True)
    app.dependency_overrides[get_current_admin] = lambda: admin
    app.dependency_overrides[get_user_gmail] = lambda: FakeGmail()
    try:
        r = client.post(
            f"/api/v1/oportunidades/{op_id}/seguimiento-mail",
            json={"cuerpo": "¿Cómo viene esta oportunidad?"},
        )
        assert r.status_code == 200, r.text
        assert r.json()["para"] == "vend@argentinacolor.com"
    finally:
        del app.dependency_overrides[get_current_admin]
        del app.dependency_overrides[get_user_gmail]

    assert enviados and enviados[0]["to"] == "vend@argentinacolor.com"
    assert "¿Cómo viene" in enviados[0]["body"]

    with TestingSessionLocal() as db:
        notis = list(db.scalars(select(Notificacion).where(Notificacion.usuario_id == 5)))
        assert len(notis) == 1
        assert notis[0].link == f"/oportunidades/{op_id}"
