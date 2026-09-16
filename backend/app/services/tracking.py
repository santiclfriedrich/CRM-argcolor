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


def pixel_tag(token: str) -> str:
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


def texto_a_html(texto: str) -> str:
    """Convierte texto plano a HTML (escapado, saltos de línea -> <br>)."""
    cuerpo = html_mod.escape(texto or "").replace("\n", "<br>")
    return (
        '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;'
        f'color:#111827;line-height:1.5">{cuerpo}</div>'
    )


def componer_html(cuerpo_html: str | None, texto: str, token: str) -> tuple[str | None, bool]:
    """Arma el HTML a enviar y dice si quedó rastreable (pixel embebido).

    - Con cuerpo_html (editor rico): se envía SIEMPRE como HTML (+ pixel si hay).
    - Sin HTML (texto plano): solo se manda como HTML si el tracking está activo
      (para poder meter el pixel); si no, se devuelve None y se manda texto plano.
    """
    pixel = pixel_tag(token)
    rastreable = bool(pixel)
    if cuerpo_html:
        return (cuerpo_html + pixel, rastreable)
    if pixel:
        return (texto_a_html(texto) + pixel, rastreable)
    return (None, False)
