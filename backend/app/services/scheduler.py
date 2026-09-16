"""Scheduler de tareas en background (APScheduler). Por ahora: polling de Gmail."""

import logging

from apscheduler.schedulers.background import BackgroundScheduler

from app.config import settings

logger = logging.getLogger(__name__)

_scheduler: BackgroundScheduler | None = None


def _run_poll() -> None:
    """Una corrida del polling, con su propia sesión de DB (no request-scoped)."""
    from app.db.session import SessionLocal
    from app.integrations.ai.factory import get_ai_provider
    from app.services.compras_ingest import ingerir_respuestas_compras
    from app.services.gmail_poller import poll_all_mailboxes

    db = SessionLocal()
    try:
        ai = get_ai_provider()
        r = poll_all_mailboxes(db, ai)
        if r["procesados"]:
            logger.info("Gmail poll: %s mail(s) nuevos procesados", r["procesados"])
        if r["errores"]:
            logger.warning(
                "Gmail poll: %s mail(s) con error. Último: %s", r["errores"], r["ultimo_error"]
            )
        # Auto-ingesta de respuestas de Compras desde los hilos de las solicitudes.
        n = ingerir_respuestas_compras(db, ai)
        if n:
            logger.info("Compras: %s respuesta(s) ingeridas automáticamente", n)
    except Exception:  # noqa: BLE001 - el job no debe tirar el scheduler
        logger.exception("Falló el polling de Gmail")
    finally:
        db.close()


def _run_programados() -> None:
    """Envía los correos programados que ya llegaron a su hora (Fase 3)."""
    from app.db.session import SessionLocal
    from app.services.mails_programados import enviar_programados_vencidos

    db = SessionLocal()
    try:
        n = enviar_programados_vencidos(db)
        if n:
            logger.info("Programados: %s correo(s) enviado(s)", n)
    except Exception:  # noqa: BLE001 - el job no debe tirar el scheduler
        logger.exception("Falló el envío de correos programados")
    finally:
        db.close()


def _run_seguimiento() -> None:
    """Chequeo diario de seguimiento (vencidas / sin avance) -> notificaciones."""
    from app.db.session import SessionLocal
    from app.services.seguimiento import generar_notificaciones_seguimiento

    db = SessionLocal()
    try:
        n = generar_notificaciones_seguimiento(db)
        if n:
            logger.info("Seguimiento diario: %s notificación(es) creadas", n)
    except Exception:  # noqa: BLE001 - el job no debe tirar el scheduler
        logger.exception("Falló el seguimiento diario")
    finally:
        db.close()


def _run_gbp_sync() -> None:
    """Sync de clientes GBP -> CRM de madrugada: scan COMPLETO (agarra altas y
    también cambios en clientes existentes, que el incremental se perdería).
    Respeta el lock: si ya hay una corrida (manual o previa), no hace nada.
    El botón del CRM usa el modo incremental (rápido) para las altas del día."""
    from app.services.gbp_runner import lanzar_sync

    r = lanzar_sync(full=True)
    logger.info("GBP sync programado (full): %s", r.get("status"))


def _run_limpieza() -> None:
    """Limpieza diaria de la bandeja: borra propuestas y descartados viejos."""
    from app.db.session import SessionLocal
    from app.services.limpieza import limpiar_bandeja

    db = SessionLocal()
    try:
        r = limpiar_bandeja(db)
        if r["propuestas"] or r["descartados"] or r.get("inbox"):
            logger.info(
                "Limpieza: %s propuesta(s), %s descartado(s) y %s mail(s) de inbox viejos borrados",
                r["propuestas"],
                r["descartados"],
                r.get("inbox", 0),
            )
    except Exception:  # noqa: BLE001 - el job no debe tirar el scheduler
        logger.exception("Falló la limpieza de la bandeja")
    finally:
        db.close()


def _run_recordatorios() -> None:
    """Dispara los recordatorios de tareas cuya hora ya llegó."""
    from app.db.session import SessionLocal
    from app.services.seguimiento import disparar_recordatorios

    db = SessionLocal()
    try:
        n = disparar_recordatorios(db)
        if n:
            logger.info("Recordatorios: %s notificación(es) creadas", n)
    except Exception:  # noqa: BLE001 - el job no debe tirar el scheduler
        logger.exception("Falló el chequeo de recordatorios")
    finally:
        db.close()


def start_scheduler() -> None:
    global _scheduler
    _scheduler = BackgroundScheduler(timezone="UTC")

    # Polling de Gmail: solo si está habilitado.
    if settings.GMAIL_ENABLED:
        _scheduler.add_job(
            _run_poll,
            "interval",
            seconds=settings.GMAIL_POLL_INTERVAL_SECONDS,
            id="gmail_poll",
        )
        logger.info("Polling de Gmail activo cada %ss", settings.GMAIL_POLL_INTERVAL_SECONDS)
    else:
        logger.info("GMAIL_ENABLED=false: polling de Gmail desactivado")

    # Seguimiento diario: siempre (independiente de Gmail). 11:00 UTC ≈ 08:00 ART.
    _scheduler.add_job(_run_seguimiento, "cron", hour=11, minute=0, id="seguimiento_diario")
    # Limpieza diaria de la bandeja (propuestas/descartados viejos): de madrugada,
    # 06:00 UTC ≈ 03:00 ART, cuando nadie usa el sistema.
    _scheduler.add_job(_run_limpieza, "cron", hour=6, minute=0, id="limpieza_bandeja")
    # Recordatorios de tareas: chequeo frecuente (granularidad de ~5 min).
    _scheduler.add_job(_run_recordatorios, "interval", minutes=5, id="recordatorios")
    # Correos programados: chequeo cada minuto para enviarlos a su hora.
    _scheduler.add_job(_run_programados, "interval", minutes=1, id="mails_programados")

    # Sync incremental de clientes GBP: 1 vez al día de madrugada (07:00 UTC ≈
    # 04:00 ART). Cada corrida tarda ~1-3h (el fetch SOAP de GBP es lento), así
    # que se corre cuando nadie usa el ERP. Manual: botón "Sincronizar GBP".
    if settings.GBP_USER and settings.GBP_PWD and settings.GBP_WS:
        _scheduler.add_job(_run_gbp_sync, "cron", hour=7, minute=0, id="gbp_sync")
        logger.info("Sync GBP programado diario (07:00 UTC)")

    _scheduler.start()
    logger.info("Scheduler activo (seguimiento diario + recordatorios cada 5 min)")


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
