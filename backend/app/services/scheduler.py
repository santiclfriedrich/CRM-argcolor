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
        n = poll_all_mailboxes(db, get_ai_provider())
        if n:
            logger.info("Gmail poll: %s mail(s) nuevos procesados", n)
    except Exception:  # noqa: BLE001 - el job no debe tirar el scheduler
        logger.exception("Falló el polling de Gmail")
    finally:
        db.close()


def start_scheduler() -> None:
    global _scheduler
    if not settings.GMAIL_ENABLED:
        logger.info("GMAIL_ENABLED=false: polling de Gmail desactivado")
        return
    _scheduler = BackgroundScheduler(timezone="UTC")
    _scheduler.add_job(
        _run_poll,
        "interval",
        seconds=settings.GMAIL_POLL_INTERVAL_SECONDS,
        id="gmail_poll",
    )
    _scheduler.start()
    logger.info("Polling de Gmail activo cada %ss", settings.GMAIL_POLL_INTERVAL_SECONDS)


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
