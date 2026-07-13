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
    from app.services.gmail_poller import poll_all_mailboxes

    db = SessionLocal()
    try:
        r = poll_all_mailboxes(db, get_ai_provider())
        if r["procesados"]:
            logger.info("Gmail poll: %s mail(s) nuevos procesados", r["procesados"])
        if r["errores"]:
            logger.warning(
                "Gmail poll: %s mail(s) con error. Último: %s", r["errores"], r["ultimo_error"]
            )
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
    _scheduler.start()
    logger.info("Scheduler activo (seguimiento diario 11:00 UTC)")


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
