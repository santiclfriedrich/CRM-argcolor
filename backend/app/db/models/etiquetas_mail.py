"""Modelo: etiquetas de la bandeja (labels tipo Gmail/Pipedrive, por usuario).

Cada usuario arma sus propias etiquetas (nombre + color) y las aplica a los mails
de su casilla. La relación mail↔etiqueta es N a N vía `mail_etiquetas`. Todo es
local al CRM: no se empuja de vuelta a Gmail.
"""

from sqlalchemy import Column, ForeignKey, Integer, String, Table, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin

# Tabla de asociación mail ↔ etiqueta (sin modelo propio: solo el vínculo).
mail_etiquetas = Table(
    "mail_etiquetas",
    Base.metadata,
    Column(
        "mail_id",
        Integer,
        ForeignKey("mails.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "etiqueta_id",
        Integer,
        ForeignKey("etiquetas_mail.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)


class EtiquetaMail(Base, TimestampMixin):
    """Una etiqueta de la bandeja de un usuario: nombre + color (hex)."""

    __tablename__ = "etiquetas_mail"
    __table_args__ = (
        UniqueConstraint("usuario_id", "nombre", name="uq_etiqueta_usuario_nombre"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    usuario_id: Mapped[int] = mapped_column(
        ForeignKey("usuarios.id"), index=True, nullable=False
    )
    nombre: Mapped[str] = mapped_column(String(60), nullable=False)
    color: Mapped[str] = mapped_column(String(20), nullable=False, default="#64748b")

    usuario = relationship("Usuario")
    mails = relationship("Mail", secondary=mail_etiquetas, back_populates="etiquetas")
