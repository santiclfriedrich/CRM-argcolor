"""Borrado en cascada de oportunidades y clientes.

Centraliza la lógica de eliminación para que borrar un cliente arrastre sus
oportunidades (y todo lo que cuelga de ellas) igual que el borrado individual.
"""

from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from app.db.models.adjuntos import Adjunto
from app.db.models.clientes import Cliente
from app.db.models.contactos_cliente import ContactoCliente
from app.db.models.dominios_cliente import DominioCliente
from app.db.models.mails import Mail
from app.db.models.mails_descartados import MailDescartado
from app.db.models.oportunidades import Oportunidad
from app.db.models.presupuesto_items import PresupuestoItem
from app.db.models.presupuestos import Presupuesto
from app.db.models.recordatorios import Recordatorio
from app.db.models.respuestas_compras import RespuestaCompras
from app.db.models.solicitudes_compras import SolicitudCompras
from app.db.models.tareas import Tarea
from app.services.storage import get_storage


def eliminar_oportunidades(db: Session, op_ids: list[int]) -> None:
    """Borra las oportunidades indicadas y todo lo que cuelga de ellas (mails y
    adjuntos, solicitudes/respuestas, presupuestos/ítems, recordatorios) y
    desvincula las tareas. NO commitea (lo hace el caller)."""
    if not op_ids:
        return

    mail_ids = list(db.scalars(select(Mail.id).where(Mail.oportunidad_id.in_(op_ids))))
    if mail_ids:
        storage = get_storage()
        for key in db.scalars(select(Adjunto.path_storage).where(Adjunto.mail_id.in_(mail_ids))):
            if key:
                try:
                    storage.delete(key)
                except OSError:
                    pass
        db.execute(delete(Adjunto).where(Adjunto.mail_id.in_(mail_ids)))

    # Mails de Gmail: marcarlos como eliminados para que el poller no los re-ingiera.
    gmail_ids = [
        g
        for g in db.scalars(
            select(Mail.gmail_message_id).where(Mail.oportunidad_id.in_(op_ids))
        )
        if g
    ]
    if gmail_ids:
        ya = set(
            db.scalars(
                select(MailDescartado.gmail_message_id).where(
                    MailDescartado.gmail_message_id.in_(gmail_ids)
                )
            )
        )
        for gid in gmail_ids:
            if gid not in ya:
                db.add(MailDescartado(gmail_message_id=gid, categoria="eliminado_manual"))

    sol_ids = list(
        db.scalars(select(SolicitudCompras.id).where(SolicitudCompras.oportunidad_id.in_(op_ids)))
    )
    if sol_ids:
        db.execute(
            delete(RespuestaCompras).where(RespuestaCompras.solicitud_compras_id.in_(sol_ids))
        )

    pres_ids = list(
        db.scalars(select(Presupuesto.id).where(Presupuesto.oportunidad_id.in_(op_ids)))
    )
    if pres_ids:
        db.execute(delete(PresupuestoItem).where(PresupuestoItem.presupuesto_id.in_(pres_ids)))

    # Desvincular tareas (no se borran; quedan sin la oportunidad).
    db.execute(update(Tarea).where(Tarea.oportunidad_id.in_(op_ids)).values(oportunidad_id=None))

    db.execute(delete(Mail).where(Mail.oportunidad_id.in_(op_ids)))
    db.execute(delete(SolicitudCompras).where(SolicitudCompras.oportunidad_id.in_(op_ids)))
    db.execute(delete(Presupuesto).where(Presupuesto.oportunidad_id.in_(op_ids)))
    db.execute(delete(Recordatorio).where(Recordatorio.oportunidad_id.in_(op_ids)))
    db.execute(delete(Oportunidad).where(Oportunidad.id.in_(op_ids)))


def eliminar_cliente(db: Session, cliente: Cliente) -> None:
    """Borra un cliente con todo lo que cuelga: contactos, dominios y sus
    oportunidades (en cascada). Desvincula las tareas del cliente. Commitea."""
    op_ids = list(db.scalars(select(Oportunidad.id).where(Oportunidad.cliente_id == cliente.id)))
    eliminar_oportunidades(db, op_ids)

    db.execute(update(Tarea).where(Tarea.cliente_id == cliente.id).values(cliente_id=None))
    db.execute(delete(ContactoCliente).where(ContactoCliente.cliente_id == cliente.id))
    db.execute(delete(DominioCliente).where(DominioCliente.cliente_id == cliente.id))
    db.delete(cliente)
    db.commit()
