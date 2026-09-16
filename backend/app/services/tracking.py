"""Email tracking: pixel de apertura para los mails salientes del CRM.

Se genera un token por mail, se embebe una imagen 1x1 invisible que apunta al
endpoint público /mails/track/{token}; cuando el cliente abre el mail y su lector
carga la imagen, se registra la apertura. Es una aproximación (depende de que el
lector cargue imágenes; Gmail lo hace por defecto, vía su proxy)."""

import html as html_mod
import secrets

from app.config import settings


def nuevo_token() -> str:
    return secrets.token_urlsafe(24)


def _pixel(token: str) -> str:
    """<img> 1x1 invisible con la URL de tracking. "" si no hay PUBLIC_BASE_URL
    (en dev el tracking queda desactivado)."""
    base = settings.PUBLIC_BASE_URL.strip().rstrip("/")
    if not base:
        return ""
    url = f"{base}/api/v1/mails/track/{token}"
    return (
        f'<img src="{url}" width="1" height="1" alt="" '
        'style="display:none;width:1px;height:1px" />'
    )


def cuerpo_con_pixel(cuerpo: str, token: str) -> str | None:
    """HTML del cuerpo (texto escapado, saltos→<br>) + pixel de tracking. Devuelve
    None si el tracking está desactivado (no hay base URL) para no mandar HTML al
    pedo."""
    pixel = _pixel(token)
    if not pixel:
        return None
    cuerpo_html = html_mod.escape(cuerpo or "").replace("\n", "<br>")
    return (
        '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;'
        f'color:#111827;line-height:1.5">{cuerpo_html}</div>{pixel}'
    )
