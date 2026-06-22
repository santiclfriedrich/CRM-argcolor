"""Google OAuth ID-token verification.

The frontend (NextAuth) logs the user in with Google and sends Google's ID token
to the backend. We verify it here and map it to (or create) a local Usuario.
"""

from typing import Any

from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

from app.config import settings


def verify_google_id_token(token: str) -> dict[str, Any] | None:
    """Verify a Google ID token. Returns the claims dict or None if invalid."""
    try:
        claims = id_token.verify_oauth2_token(
            token, google_requests.Request(), settings.GOOGLE_CLIENT_ID
        )
        return claims
    except (ValueError, Exception):  # noqa: BLE001 - token inválido o expirado
        return None
