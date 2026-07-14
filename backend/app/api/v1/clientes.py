"""CRUD endpoints for clientes."""

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.exceptions import NotFoundError
from app.db.models.clientes import Cliente
from app.db.models.usuarios import Usuario
from app.db.session import get_db
from app.schemas.cliente import ClienteCreate, ClienteDetail, ClienteRead, ClienteUpdate
from app.services.borrado import eliminar_cliente

router = APIRouter(prefix="/clientes", tags=["clientes"])


def _validar_cuenta_principal(
    db: Session, cuenta_principal_id: int | None, propio_id: int | None
) -> None:
    """La cuenta principal debe existir y no puede ser la propia cuenta."""
    if cuenta_principal_id is None:
        return
    if cuenta_principal_id == propio_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Una cuenta no puede ser su propia cuenta principal.",
        )
    if db.get(Cliente, cuenta_principal_id) is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La cuenta principal indicada no existe.",
        )


@router.get("", response_model=list[ClienteRead])
def list_clientes(
    db: Session = Depends(get_db), _: Usuario = Depends(get_current_user)
) -> list[Cliente]:
    return list(db.scalars(select(Cliente).order_by(Cliente.razon_social)))


@router.post("", response_model=ClienteRead, status_code=201)
def create_cliente(
    body: ClienteCreate, db: Session = Depends(get_db), _: Usuario = Depends(get_current_user)
) -> Cliente:
    _validar_cuenta_principal(db, body.cuenta_principal_id, None)
    cliente = Cliente(**body.model_dump())
    db.add(cliente)
    db.commit()
    db.refresh(cliente)
    return cliente


@router.get("/{cliente_id}", response_model=ClienteDetail)
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
    data = body.model_dump(exclude_unset=True)
    if "cuenta_principal_id" in data:
        _validar_cuenta_principal(db, data["cuenta_principal_id"], cliente_id)
    for field, value in data.items():
        setattr(cliente, field, value)
    db.commit()
    db.refresh(cliente)
    return cliente


@router.delete("/{cliente_id}", status_code=204)
def delete_cliente(
    cliente_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
) -> Response:
    """Elimina el cliente y todo lo que cuelga: contactos, dominios y sus
    oportunidades (con mails, presupuestos, solicitudes). Desvincula tareas."""
    cliente = db.get(Cliente, cliente_id)
    if cliente is None:
        raise NotFoundError("Cliente no encontrado")
    eliminar_cliente(db, cliente)
    return Response(status_code=204)
