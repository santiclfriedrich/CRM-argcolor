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
    """Sync incremental de clientes GBP -> CRM (dedup por CUIT, solo nuevos).
    Respeta el lock: si ya hay una corrida (manual o previa), no hace nada."""
    from app.services.gbp_runner import lanzar_sync

    r = lanzar_sync()
    logger.info("GBP sync programado: %s", r.get("status"))


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
    # Recordatorios de tareas: chequeo frecuente (granularidad de ~5 min).
    _scheduler.add_job(_run_recordatorios, "interval", minutes=5, id="recordatorios")

    # Sync incremental de clientes GBP cada 8h (solo si GBP está configurado).
    if settings.GBP_USER and settings.GBP_PWD and settings.GBP_WS:
        _scheduler.add_job(_run_gbp_sync, "interval", hours=8, id="gbp_sync")
        logger.info("Sync GBP programado cada 8h")

    _scheduler.start()
    logger.info("Scheduler activo (seguimiento diario + recordatorios cada 5 min)")


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
