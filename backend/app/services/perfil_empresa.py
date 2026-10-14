"""Perfil de Empresa: datos fijos que siempre se piden en los formularios de alta
de proveedor / licitaciones. Se guarda como un único registro en `configuracion`
(clave `perfil_empresa`) y se edita desde la web. Precargado con lo extraído de
los PDFs de la empresa; de ahí en más manda lo que el usuario guarde."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models.configuracion import Configuracion

_CLAVE = "perfil_empresa"

# Valores precargados (extraídos de ARCA + IIBB + Constancia CBU). Son el default
# la primera vez; una vez que el usuario guarda, manda lo guardado.
DEFAULT: dict[str, str] = {
    "razon_social": "MERCADOS DIGITALES S.A.",
    "cuit": "30-71737169-7",
    "forma_juridica": "Sociedad Anónima",
    "fecha_contrato_social": "12/10/2021",
    "domicilio": "Rodríguez Peña 434, Piso 4, Of. A",
    "localidad": "Ciudad Autónoma de Buenos Aires",
    "cp": "1020",
    "provincia": "CABA",
    "telefono": "",
    "email": "",
    "condicion_iva": "Responsable Inscripto",
    "condicion_iibb": "Convenio Multilateral",
    "nro_iibb": "30-71737169-7",
    "jurisdicciones_iibb": "CABA (901), Buenos Aires (902)",
    "condicion_ganancias": "Responsable Inscripto",
    "actividad_principal": "620900 - Servicios de informática n.c.p.",
    "actividad_secundaria": "731009 - Servicios de publicidad n.c.p.",
    "banco": "Banco Galicia",
    "sucursal": "660",
    "cuenta": "Cuenta Corriente en Pesos N° 0005964-4 303-1",
    "cbu": "0070303920000005964413",
    "contacto_nombre": "",
    "contacto_area": "",
    "contacto_email": "",
    "concepto_retencion": "",
    "observaciones": "",
}


def get_perfil_empresa(db: Session) -> dict[str, str]:
    """Perfil guardado, con los defaults como base (así campos nuevos no rompen)."""
    cfg = db.scalar(select(Configuracion).where(Configuracion.clave == _CLAVE))
    guardado = cfg.valor if cfg and cfg.valor else {}
    return {**DEFAULT, **guardado}


def set_perfil_empresa(db: Session, data: dict[str, str]) -> dict[str, str]:
    """Guarda (upsert) el perfil. Solo persiste las claves conocidas."""
    limpio = {k: (data.get(k) or "") for k in DEFAULT}
    cfg = db.scalar(select(Configuracion).where(Configuracion.clave == _CLAVE))
    if cfg is None:
        cfg = Configuracion(clave=_CLAVE, valor=limpio)
        db.add(cfg)
    else:
        cfg.valor = limpio  # reasignar dispara el UPDATE del JSONB
    db.commit()
    return {**DEFAULT, **limpio}
