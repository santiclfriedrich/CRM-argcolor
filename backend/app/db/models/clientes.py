"""Modelo: clientes (cuentas)."""

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class Cliente(Base, TimestampMixin):
    __tablename__ = "clientes"

    id: Mapped[int] = mapped_column(primary_key=True)
    razon_social: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    cuit: Mapped[str | None] = mapped_column(String(20), index=True)
    numero_cliente: Mapped[str | None] = mapped_column(String(40), index=True)  # "CL N°" en el ERP
    vendedor_asignado_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"))
    notas: Mapped[str | None] = mapped_column(Text)  # "Descripción" en la UI
    activo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Jerarquía: cuenta principal (padre). Sus hijas quedan en `subcuentas`.
    cuenta_principal_id: Mapped[int | None] = mapped_column(ForeignKey("clientes.id"))

    # Datos adicionales (estilo Salesforce).
    tipo: Mapped[str | None] = mapped_column(String(50))  # cliente / prospecto / competidor…
    sector: Mapped[str | None] = mapped_column(String(80))  # rubro / industria
    sitio_web: Mapped[str | None] = mapped_column(String(255))
    telefono: Mapped[str | None] = mapped_column(String(50))
    empleados: Mapped[int | None] = mapped_column(Integer)
    direccion_facturacion: Mapped[str | None] = mapped_column(Text)
    direccion_envio: Mapped[str | None] = mapped_column(Text)

    vendedor_asignado = relationship("Usuario", back_populates="clientes")
    contactos = relationship("ContactoCliente", back_populates="cliente")
    dominios = relationship("DominioCliente", back_populates="cliente")
    oportunidades = relationship("Oportunidad", back_populates="cliente")
    cuenta_principal = relationship("Cliente", remote_side=[id], backref="subcuentas")
