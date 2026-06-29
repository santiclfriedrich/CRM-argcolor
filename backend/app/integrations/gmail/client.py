"""Cliente de Gmail API (Camino A: OAuth refresh token de la casilla comercial).

Lectura entrante para el polling de la bandeja. El envío saliente (acuse de
recibo) se agrega en el Slice 4. El parsing de mensajes es una función pura
(`parse_gmail_message`) para poder testearlo sin tocar la API.
"""

import base64
from datetime import datetime, timezone
from email.message import EmailMessage
from email.utils import parseaddr
from typing import Any

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

from app.config import settings

# readonly para leer; send queda pedido de antemano para el acuse (Slice 4).
GMAIL_SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
]
_TOKEN_URI = "https://oauth2.googleapis.com/token"


def _decode_body(data: str) -> str:
    return base64.urlsafe_b64decode(data.encode()).decode("utf-8", errors="replace")


def _extract_text(payload: dict[str, Any]) -> str:
    """Devuelve el texto plano del mail recorriendo las partes MIME."""
    mime = payload.get("mimeType", "")
    body = payload.get("body", {})
    if mime == "text/plain" and body.get("data"):
        return _decode_body(body["data"])

    parts = payload.get("parts") or []
    for part in parts:  # preferimos text/plain directo
        if part.get("mimeType") == "text/plain" and part.get("body", {}).get("data"):
            return _decode_body(part["body"]["data"])
    for part in parts:  # si no, recursión (multipart anidado)
        text = _extract_text(part)
        if text:
            return text

    if mime == "text/html" and body.get("data"):
        return _decode_body(body["data"])
    return ""


def _header(headers: list[dict[str, str]], name: str) -> str | None:
    return next((h["value"] for h in headers if h["name"].lower() == name.lower()), None)


def parse_gmail_message(msg: dict[str, Any]) -> dict[str, Any]:
    """Normaliza un mensaje de la Gmail API a los campos que usa el pipeline."""
    payload = msg.get("payload", {})
    headers = payload.get("headers", [])
    de_raw = _header(headers, "From")
    fecha = None
    if msg.get("internalDate"):
        fecha = datetime.fromtimestamp(int(msg["internalDate"]) / 1000, tz=timezone.utc)
    return {
        "message_id": msg.get("id"),
        "thread_id": msg.get("threadId"),
        "de": parseaddr(de_raw or "")[1] or de_raw,
        "para": _header(headers, "To"),
        "asunto": _header(headers, "Subject"),
        "cuerpo": _extract_text(payload) or msg.get("snippet", ""),
        "fecha": fecha,
    }


class GmailClient:
    """Wrapper de la Gmail API autenticado con el refresh token de la casilla."""

    def __init__(self) -> None:
        if not settings.GMAIL_REFRESH_TOKEN:
            raise RuntimeError(
                "Gmail sin configurar: falta GMAIL_REFRESH_TOKEN en backend/.env "
                "(corré scripts.gmail_authorize)."
            )
        creds = Credentials(
            token=None,
            refresh_token=settings.GMAIL_REFRESH_TOKEN,
            client_id=settings.GMAIL_CLIENT_ID,
            client_secret=settings.GMAIL_CLIENT_SECRET,
            token_uri=_TOKEN_URI,
            scopes=GMAIL_SCOPES,
        )
        self._service = build("gmail", "v1", credentials=creds, cache_discovery=False)
        self._user = settings.GMAIL_USER or "me"

    def list_message_ids(self, query: str, max_results: int = 25) -> list[str]:
        resp = (
            self._service.users()
            .messages()
            .list(userId=self._user, q=query, maxResults=max_results)
            .execute()
        )
        return [m["id"] for m in resp.get("messages", [])]

    def get_message(self, message_id: str) -> dict[str, Any]:
        raw = (
            self._service.users()
            .messages()
            .get(userId=self._user, id=message_id, format="full")
            .execute()
        )
        return parse_gmail_message(raw)

    def send_message(
        self, to: str, subject: str, body: str, thread_id: str | None = None
    ) -> dict[str, str | None]:
        """Envía un mail desde la casilla. Si pasás thread_id, responde en el hilo."""
        message = EmailMessage()
        message["To"] = to
        if "@" in (settings.GMAIL_USER or ""):
            message["From"] = settings.GMAIL_USER
        message["Subject"] = subject
        message.set_content(body)

        payload: dict[str, Any] = {
            "raw": base64.urlsafe_b64encode(message.as_bytes()).decode()
        }
        if thread_id:
            payload["threadId"] = thread_id
        sent = (
            self._service.users().messages().send(userId=self._user, body=payload).execute()
        )
        return {"message_id": sent.get("id"), "thread_id": sent.get("threadId")}
