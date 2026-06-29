"""Genera el refresh token de la casilla comercial (Camino A, OAuth Internal).

Requisitos previos (Google Cloud, ver checklist):
  - OAuth consent screen en modo Internal.
  - OAuth client ID tipo "Desktop app".
  - GMAIL_CLIENT_ID y GMAIL_CLIENT_SECRET cargados en backend/.env.

Uso (desde backend/, con el venv activo):
    python -m scripts.gmail_authorize

Abre el navegador, te pide iniciar sesión CON LA CASILLA COMERCIAL y aceptar
los permisos. Al final imprime el refresh token para pegar en backend/.env:
    GMAIL_REFRESH_TOKEN=<valor impreso>
"""

from google_auth_oauthlib.flow import InstalledAppFlow

from app.config import settings
from app.integrations.gmail.client import GMAIL_SCOPES


def main() -> None:
    if not (settings.GMAIL_CLIENT_ID and settings.GMAIL_CLIENT_SECRET):
        raise SystemExit(
            "Faltan GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET en backend/.env. "
            "Creá un OAuth client ID tipo 'Desktop app' y cargalos primero."
        )

    client_config = {
        "installed": {
            "client_id": settings.GMAIL_CLIENT_ID,
            "client_secret": settings.GMAIL_CLIENT_SECRET,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": ["http://localhost"],
        }
    }
    flow = InstalledAppFlow.from_client_config(client_config, GMAIL_SCOPES)
    # access_type=offline + prompt=consent garantizan que devuelva refresh_token.
    creds = flow.run_local_server(port=0, access_type="offline", prompt="consent")

    print("\n=== LISTO ===")
    print("Pegá esta línea en backend/.env:\n")
    print(f"GMAIL_REFRESH_TOKEN={creds.refresh_token}")
    print("\nY poné GMAIL_ENABLED=true + GMAIL_USER=<casilla> para activar el polling.")


if __name__ == "__main__":
    main()
