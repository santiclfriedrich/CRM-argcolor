"""CRUD endpoints for clientes."""

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_current_user
from app.core.exceptions import NotFoundError
from app.db.models.clientes import Cliente
from app.db.models.usuarios import Usuario
from app.db.session import get_db
from app.schemas.cliente import ClienteCreate, ClienteDetail, ClienteRead, ClienteUpdate
from app.services.borrado import eliminar_cliente

router = APIRouter(prefix="/clientes", tags=["clientes"])


def _solo_digitos(cuit: str | None) -> str:
    return "".join(ch for ch in (cuit or "") if ch.isdigit())


def _normalizar_cuit(cuit: str | None) -> str:
    """Valida (11 dígitos) y devuelve el CUIT en formato canónico XX-XXXXXXXX-X."""
    digitos = _solo_digitos(cuit)
    if len(digitos) != 11:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="El CUIT debe tener 11 dígitos (ej. 30-58699951-2).",
        )
    return f"{digitos[:2]}-{digitos[2:10]}-{digitos[10]}"


def _validar_cuit_unico(db: Session, canonico: str, excluir_id: int | None = None) -> None:
    """Rechaza (409) si ya existe otra cuenta con el mismo CUIT (comparando por
    dígitos, sin importar el formato con que se haya guardado)."""
    digitos = _solo_digitos(canonico)
    for cid, cuit in db.execute(select(Cliente.id, Cliente.cuit)).all():
        if cid == excluir_id or not cuit:
            continue
        if _solo_digitos(cuit) == digitos:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Ya existe una cuenta con el CUIT {canonico}.",
            )


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
    return list(
        db.scalars(
            select(Cliente)
            .options(selectinload(Cliente.creado_por))
            .order_by(Cliente.razon_social)
        )
    )


@router.post("", response_model=ClienteRead, status_code=201)
def create_cliente(
    body: ClienteCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> Cliente:
    _validar_cuenta_principal(db, body.cuenta_principal_id, None)
    canonico = _normalizar_cuit(body.cuit)  # obligatorio al crear
    _validar_cuit_unico(db, canonico)
    data = body.model_dump()
    data["cuit"] = canonico
    cliente = Cliente(**data, creado_por_id=current_user.id)
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
    if "cuit" in data:
        canonico = _normalizar_cuit(data["cuit"])
        _validar_cuit_unico(db, canonico, excluir_id=cliente_id)
        data["cuit"] = canonico
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
