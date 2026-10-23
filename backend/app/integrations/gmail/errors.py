"""Clasificación de errores de Gmail para devolver mensajes claros y accionables.

El envío por Gmail puede fallar por motivos muy distintos (token vencido, cuota
agotada, falta de permisos, destinatario inválido). En vez de un 502 críptico con
el traceback crudo, mapeamos la excepción a un (status_code, mensaje) útil.
"""

from __future__ import annotations

from googleapiclient.errors import HttpError

try:
    from google.auth.exceptions import RefreshError
except ImportError:  # pragma: no cover - google-auth siempre está, pero por las dudas
    RefreshError = ()  # type: ignore[assignment,misc]


def clasificar_error_gmail(exc: Exception) -> tuple[int, str]:
    """Devuelve (status_code, mensaje_para_el_usuario) según el error de Gmail."""
    texto = str(exc)

    # Token OAuth del usuario vencido/revocado -> hay que reconectar la casilla.
    if isinstance(exc, RefreshError) or "invalid_grant" in texto:
        return (
            401,
            "Se venció tu conexión con Gmail. Cerrá sesión y volvé a entrar para "
            "reconectar tu casilla, y reintentá.",
        )

    if isinstance(exc, HttpError):
        status = getattr(getattr(exc, "resp", None), "status", None)
        bajo = texto.lower()
        if "ratelimitexceeded" in bajo or "quota exceeded" in bajo or status == 429:
            return (
                503,
                "Gmail está limitando los envíos en este momento (cuota por minuto). "
                "Esperá un minuto y reintentá.",
            )
        if status == 403 and ("insufficient" in bajo or "permission" in bajo):
            return (
                403,
                "Tu cuenta de Gmail no tiene permisos para enviar. Reconectá tu "
                "casilla desde el login.",
            )

    return (502, f"No se pudo enviar el mail: {exc}")
