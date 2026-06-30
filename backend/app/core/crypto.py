"""Cifrado simétrico para secretos guardados en la DB (ej. refresh tokens de Gmail).

Usa Fernet con una clave derivada del SECRET_KEY, así no agregamos otra variable
de entorno. Si el SECRET_KEY cambia, los tokens viejos dejan de poder descifrarse
(los usuarios simplemente reconectan su Gmail).
"""

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from app.config import settings


def _fernet() -> Fernet:
    key = base64.urlsafe_b64encode(hashlib.sha256(settings.SECRET_KEY.encode()).digest())
    return Fernet(key)


def encrypt(plaintext: str) -> str:
    """Cifra un secreto y devuelve el token (str) para guardar en la DB."""
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt(token: str | None) -> str | None:
    """Descifra; devuelve None si el token es inválido o no descifrable."""
    if not token:
        return None
    try:
        return _fernet().decrypt(token.encode()).decode()
    except (InvalidToken, ValueError):
        return None
