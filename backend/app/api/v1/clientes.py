"""CRUD endpoints for clientes."""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.exceptions import NotFoundError
from app.db.models.clientes import Cliente
from app.db.models.usuarios import Usuario
from app.db.session import get_db
from app.schemas.cliente import ClienteCreate, ClienteRead, ClienteUpdate

router = APIRouter(prefix="/clientes", tags=["clientes"])


@router.get("", response_model=list[ClienteRead])
def list_clientes(
    db: Session = Depends(get_db), _: Usuario = Depends(get_current_user)
) -> list[Cliente]:
    return list(db.scalars(select(Cliente).order_by(Cliente.razon_social)))


@router.post("", response_model=ClienteRead, status_code=201)
def create_cliente(
    body: ClienteCreate, db: Session = Depends(get_db), _: Usuario = Depends(get_current_user)
) -> Cliente:
    cliente = Cliente(**body.model_dump())
    db.add(cliente)
    db.commit()
    db.refresh(cliente)
    return cliente


@router.get("/{cliente_id}", response_model=ClienteRead)
def get_cliente(
    cliente_id: int, db: Session = Depends(get_db), _: Usuario = Depends(get_current_user)
) -> Cliente:
    cliente = db.get(Cliente, cliente_id)
    if cliente is None:
        raise NotFoundError("Cliente no encontrado")
    return cliente


@router.patch("/{cliente_id}", response_model=ClienteRead)
def update_cliente(
    cliente_id: int,
    body: ClienteUpdate,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
) -> Cliente:
    cliente = db.get(Cliente, cliente_id)
    if cliente is None:
        raise NotFoundError("Cliente no encontrado")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(cliente, field, value)
    db.commit()
    db.refresh(cliente)
    return cliente
