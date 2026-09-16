"""CRUD endpoints for clientes."""

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session, load_only, selectinload

from app.api.deps import get_current_user
from app.core.exceptions import NotFoundError
from app.db.models.clientes import Cliente
from app.db.models.usuarios import Usuario
from app.db.session import get_db
from app.schemas.cliente import (
    ClienteCreate,
    ClienteDetail,
    ClienteListItem,
    ClienteRead,
    ClienteUpdate,
)
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
    """Rechaza (409) si ya existe otra cuenta con el mismo CUIT.

    El `canonico` ya viene normalizado a 'XX-XXXXXXXX-X' por el caller, y todos
    los caminos de escritura (esta API y el sync de GBP) guardan el CUIT en ese
    mismo formato. Por eso alcanza con una igualdad indexada (usa ix_clientes_cuit)
    en vez de escanear toda la tabla comparando dígitos en Python.
    """
    stmt = select(Cliente.id).where(Cliente.cuit == canonico)
    if excluir_id is not None:
        stmt = stmt.where(Cliente.id != excluir_id)
    if db.scalar(stmt.limit(1)) is not None:
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


@router.get("", response_model=list[ClienteListItem])
def list_clientes(
    db: Session = Depends(get_db), _: Usuario = Depends(get_current_user)
) -> list[Cliente]:
    # Listado liviano: traemos SOLO las columnas que la tabla y los pickers usan
    # (load_only), no las 8k filas con todos los campos de texto largo. Esto
    # recorta el egress de Neon, que es lo que venía reventando la cuota.
    return list(
        db.scalars(
            select(Cliente)
            .options(
                load_only(
                    Cliente.id,
                    Cliente.razon_social,
                    Cliente.cuit,
                    Cliente.numero_cliente,
                    Cliente.activo,
                    Cliente.vendedor_asignado_id,
                    Cliente.created_at,
                ),
                selectinload(Cliente.creado_por).load_only(Usuario.id, Usuario.nombre),
            )
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


# --- Alta bidireccional en GBP -------------------------------------------------
class AltaGbpBody(BaseModel):
    """Datos para dar de alta el cliente en GBP (los que el CRM no tiene
    estructurados: provincia y condición IVA se completan al momento)."""

    state_id: str  # id de provincia de GBP (States_funGetXMLData)
    fiscalclass: str = "1"  # condición IVA (1 = Responsable Inscripto)
    taxnumbertype: str = "80"  # tipo de documento (80 = CUIT)
    city: str = ""
    zip: str = ""
    address: str | None = None
    email: str | None = None
    phone: str | None = None


@router.get("/gbp/provincias")
def gbp_provincias(_: Usuario = Depends(get_current_user)) -> list[dict[str, str]]:
    """Provincias de GBP (para el selector del alta): [{id, nombre}]."""
    from app.integrations.gbp.client import GBPClient

    try:
        with GBPClient() as erp:
            filas = erp.fetch_states("54")
    except Exception as exc:  # noqa: BLE001 - frontera con GBP
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"No se pudieron traer las provincias de GBP: {exc}",
        ) from exc
    out: list[dict[str, str]] = []
    for f in filas:
        sid = f.get("state_id") or f.get("id")
        if not sid:
            continue
        nombre = (
            f.get("state_name")
            or f.get("name")
            or f.get("descripcion")
            or f.get("state_description")
            or str(sid)
        )
        out.append({"id": str(sid), "nombre": nombre})
    return out


@router.post("/{cliente_id}/gbp")
def alta_cliente_gbp(
    cliente_id: int,
    body: AltaGbpBody,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
) -> dict:
    """Da de alta el cliente en GBP (o lo vincula si el CUIT ya existe) y guarda el
    cust_id como `numero_cliente`."""
    cliente = db.get(Cliente, cliente_id)
    if cliente is None:
        raise NotFoundError("Cliente no encontrado")
    if cliente.numero_cliente:
        raise HTTPException(
            status_code=400,
            detail=f"El cliente ya tiene N° de cliente ({cliente.numero_cliente}).",
        )

    from app.integrations.gbp.client import GBPClient
    from app.services.gbp_alta import crear_cliente_en_gbp

    try:
        with GBPClient() as erp:
            resultado = crear_cliente_en_gbp(
                db,
                erp,
                cliente,
                state_id=body.state_id,
                fiscalclass=body.fiscalclass,
                taxnumbertype=body.taxnumbertype,
                city=body.city,
                zip_code=body.zip,
                address=body.address,
                email=body.email,
                phone=body.phone,
            )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001 - frontera con GBP
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Error al comunicarse con GBP: {exc}",
        ) from exc
    return {**resultado, "numero_cliente": cliente.numero_cliente}
