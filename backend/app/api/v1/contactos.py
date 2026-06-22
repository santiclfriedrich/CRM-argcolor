"""CRUD endpoints for contactos de un cliente (nested under /clientes)."""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.exceptions import NotFoundError
from app.db.models.clientes import Cliente
from app.db.models.contactos_cliente import ContactoCliente
from app.db.models.usuarios import Usuario
from app.db.session import get_db
from app.schemas.contacto import ContactoCreate, ContactoRead, ContactoUpdate

router = APIRouter(prefix="/clientes/{cliente_id}/contactos", tags=["contactos"])


def _ensure_cliente(db: Session, cliente_id: int) -> None:
    if db.get(Cliente, cliente_id) is None:
        raise NotFoundError("Cliente no encontrado")


def _get_contacto(db: Session, cliente_id: int, contacto_id: int) -> ContactoCliente:
    contacto = db.get(ContactoCliente, contacto_id)
    if contacto is None or contacto.cliente_id != cliente_id:
        raise NotFoundError("Contacto no encontrado")
    return contacto


@router.get("", response_model=list[ContactoRead])
def list_contactos(
    cliente_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
) -> list[ContactoCliente]:
    _ensure_cliente(db, cliente_id)
    return list(
        db.scalars(
            select(ContactoCliente)
            .where(ContactoCliente.cliente_id == cliente_id)
            .order_by(ContactoCliente.es_principal.desc(), ContactoCliente.nombre)
        )
    )


@router.post("", response_model=ContactoRead, status_code=201)
def create_contacto(
    cliente_id: int,
    body: ContactoCreate,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
) -> ContactoCliente:
    _ensure_cliente(db, cliente_id)
    contacto = ContactoCliente(cliente_id=cliente_id, **body.model_dump())
    db.add(contacto)
    db.commit()
    db.refresh(contacto)
    return contacto


@router.patch("/{contacto_id}", response_model=ContactoRead)
def update_contacto(
    cliente_id: int,
    contacto_id: int,
    body: ContactoUpdate,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
) -> ContactoCliente:
    contacto = _get_contacto(db, cliente_id, contacto_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(contacto, field, value)
    db.commit()
    db.refresh(contacto)
    return contacto


@router.delete("/{contacto_id}", status_code=204)
def delete_contacto(
    cliente_id: int,
    contacto_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
) -> None:
    contacto = _get_contacto(db, cliente_id, contacto_id)
    db.delete(contacto)
    db.commit()
