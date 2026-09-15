"""Importa todos los modelos para que Alembic los detecte vía Base.metadata."""

from app.db.models.adjuntos import Adjunto
from app.db.models.clientes import Cliente
from app.db.models.configuracion import Configuracion
from app.db.models.contactos_cliente import ContactoCliente, RolCompra
from app.db.models.dominios_cliente import DominioCliente
from app.db.models.grupos_compras import GrupoCompras
from app.db.models.mails import DireccionMail, Mail
from app.db.models.mails_descartados import MailDescartado
from app.db.models.mails_programados import MailProgramado
from app.db.models.notas_personales import NotaPersonal
from app.db.models.notificaciones import Notificacion
from app.db.models.oportunidades import EstadoOportunidad, Oportunidad
from app.db.models.presupuesto_items import PresupuestoItem
from app.db.models.presupuestos import EstadoPresupuesto, Presupuesto
from app.db.models.productos import Producto
from app.db.models.recordatorios import Recordatorio, TipoRecordatorio
from app.db.models.respuestas_compras import RespuestaCompras
from app.db.models.solicitudes_compras import (
    CondicionPago,
    EstadoSolicitud,
    SolicitudCompras,
)
from app.db.models.tareas import PrioridadTarea, Tarea
from app.db.models.usuarios import RolUsuario, Usuario

__all__ = [
    "Adjunto",
    "Cliente",
    "Configuracion",
    "ContactoCliente",
    "RolCompra",
    "DominioCliente",
    "GrupoCompras",
    "DireccionMail",
    "Mail",
    "MailDescartado",
    "MailProgramado",
    "NotaPersonal",
    "Notificacion",
    "EstadoOportunidad",
    "Oportunidad",
    "PresupuestoItem",
    "EstadoPresupuesto",
    "Presupuesto",
    "Producto",
    "Recordatorio",
    "TipoRecordatorio",
    "RespuestaCompras",
    "CondicionPago",
    "EstadoSolicitud",
    "SolicitudCompras",
    "PrioridadTarea",
    "Tarea",
    "RolUsuario",
    "Usuario",
]
