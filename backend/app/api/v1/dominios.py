"""CRUD endpoints for dominios de un cliente (nested under /clientes)."""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.exceptions import NotFoundError
from app.db.models.clientes import Cliente
from app.db.models.dominios_cliente import DominioCliente
from app.db.models.usuarios import Usuario
from app.db.session import get_db
from app.schemas.dominio import DominioCreate, DominioRead, DominioUpdate

router = APIRouter(prefix="/clientes/{cliente_id}/dominios", tags=["dominios"])


def _ensure_cliente(db: Session, cliente_id: int) -> None:
    if db.get(Cliente, cliente_id) is None:
        raise NotFoundError("Cliente no encontrado")


def _get_dominio(db: Session, cliente_id: int, dominio_id: int) -> DominioCliente:
    dominio = db.get(DominioCliente, dominio_id)
    if dominio is None or dominio.cliente_id != cliente_id:
        raise NotFoundError("Dominio no encontrado")
    return dominio


@router.get("", response_model=list[DominioRead])
def list_dominios(
    cliente_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
) -> list[DominioCliente]:
    _ensure_cliente(db, cliente_id)
    return list(
        db.scalars(
            select(DominioCliente)
            .where(DominioCliente.cliente_id == cliente_id)
            .order_by(DominioCliente.es_principal_dominio.desc(), DominioCliente.dominio)
        )
    )


@router.post("", response_model=DominioRead, status_code=201)
def create_dominio(
    cliente_id: int,
    body: DominioCreate,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
) -> DominioCliente:
    _ensure_cliente(db, cliente_id)
    dominio = DominioCliente(cliente_id=cliente_id, **body.model_dump())
    db.add(dominio)
    db.commit()
    db.refresh(dominio)
    return dominio


@router.patch("/{dominio_id}", response_model=DominioRead)
def update_dominio(
    cliente_id: int,
    dominio_id: int,
    body: DominioUpdate,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
) -> DominioCliente:
    dominio = _get_dominio(db, cliente_id, dominio_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(dominio, field, value)
    db.commit()
    db.refresh(dominio)
    return dominio


@router.delete("/{dominio_id}", status_code=204)
def delete_dominio(
    cliente_id: int,
    dominio_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
) -> None:
    dominio = _get_dominio(db, cliente_id, dominio_id)
    db.delete(dominio)
    db.commit()
