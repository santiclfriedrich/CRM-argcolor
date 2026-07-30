"""Búsqueda global: localiza clientes, contactos y oportunidades en un solo lugar."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_current_user
from app.db.models.clientes import Cliente
from app.db.models.contactos_cliente import ContactoCliente
from app.db.models.oportunidades import Oportunidad
from app.db.models.usuarios import Usuario
from app.db.session import get_db

router = APIRouter(prefix="/search", tags=["search"])

_LIMIT = 8


class ClienteHit(BaseModel):
    id: int
    razon_social: str


class ContactoHit(BaseModel):
    id: int
    nombre: str
    cliente_id: int | None = None
    cliente_nombre: str | None = None


class OportunidadHit(BaseModel):
    id: int
    asunto: str | None = None
    estado: str
    cliente_nombre: str | None = None


class SearchResults(BaseModel):
    clientes: list[ClienteHit] = []
    contactos: list[ContactoHit] = []
    oportunidades: list[OportunidadHit] = []


@router.get("", response_model=SearchResults)
def buscar(
    q: str,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
) -> SearchResults:
    """Busca por texto en cuentas, contactos y operaciones (case-insensitive)."""
    termino = q.strip()
    if len(termino) < 2:
        return SearchResults()
    patron = f"%{termino}%"

    clientes = list(
        db.scalars(
            select(Cliente)
            .where(or_(Cliente.razon_social.ilike(patron), Cliente.cuit.ilike(patron)))
            .limit(_LIMIT)
        )
    )

    contactos = list(
        db.scalars(
            select(ContactoCliente)
            .where(
                or_(
                    ContactoCliente.nombre.ilike(patron),
                    ContactoCliente.email.ilike(patron),
                )
            )
            .options(selectinload(ContactoCliente.cliente))
            .limit(_LIMIT)
        )
    )

    oportunidades = list(
        db.scalars(
            select(Oportunidad)
            .where(
                Oportunidad.asunto.ilike(patron),
                Oportunidad.pendiente_revision.is_(False),
            )
            .options(selectinload(Oportunidad.cliente))
            .order_by(Oportunidad.fecha_ultimo_movimiento.desc())
            .limit(_LIMIT)
        )
    )

    return SearchResults(
        clientes=[ClienteHit(id=c.id, razon_social=c.razon_social) for c in clientes],
        contactos=[
            ContactoHit(
                id=ct.id,
                nombre=ct.nombre,
                cliente_id=ct.cliente_id,
                cliente_nombre=ct.cliente.razon_social if ct.cliente else None,
            )
            for ct in contactos
        ],
        oportunidades=[
            OportunidadHit(
                id=o.id,
                asunto=o.asunto,
                estado=o.estado.value,
                cliente_nombre=o.cliente.razon_social if o.cliente else None,
            )
            for o in oportunidades
        ],
    )
