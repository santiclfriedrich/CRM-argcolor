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

from google.oauth2 import service_account
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


# Máximo de imágenes a procesar por mail (corte defensivo de costo/payload).
MAX_IMAGES = 5


def _collect_image_attachments(payload: dict[str, Any]) -> list[dict[str, Any]]:
    """Metadatos de los adjuntos tipo imagen (recursivo sobre las partes MIME)."""
    found: list[dict[str, Any]] = []

    def walk(part: dict[str, Any]) -> None:
        mime = part.get("mimeType", "")
        body = part.get("body", {})
        if mime.startswith("image/") and (body.get("data") or body.get("attachmentId")):
            found.append(
                {
                    "nombre": part.get("filename") or "imagen",
                    "mime": mime,
                    "attachment_id": body.get("attachmentId"),
                    "data": body.get("data"),  # inline base64url, si vino embebida
                }
            )
        for child in part.get("parts") or []:
            walk(child)

    walk(payload)
    return found


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
        "attachments": _collect_image_attachments(payload),
    }


class GmailClient:
    """Wrapper de la Gmail API.

    - Camino A (refresh token): lee la casilla dueña del token (`user` se ignora).
    - Camino B (service account + delegation): impersona la casilla `user`.
    """

    def __init__(self, user: str | None = None) -> None:
        if settings.GMAIL_SERVICE_ACCOUNT_FILE:
            # Camino B: impersonación vía domain-wide delegation.
            if not user:
                raise RuntimeError("Camino B requiere indicar la casilla a impersonar.")
            creds = service_account.Credentials.from_service_account_file(
                settings.GMAIL_SERVICE_ACCOUNT_FILE, scopes=GMAIL_SCOPES
            ).with_subject(user)
            self._user = user
        elif settings.GMAIL_REFRESH_TOKEN:
            # Camino A: refresh token de una sola casilla.
            creds = Credentials(
                token=None,
                refresh_token=settings.GMAIL_REFRESH_TOKEN,
                client_id=settings.GMAIL_CLIENT_ID,
                client_secret=settings.GMAIL_CLIENT_SECRET,
                token_uri=_TOKEN_URI,
                scopes=GMAIL_SCOPES,
            )
            self._user = user or settings.GMAIL_USER or "me"
        else:
            raise RuntimeError(
                "Gmail sin configurar: definí GMAIL_SERVICE_ACCOUNT_FILE (Camino B) o "
                "GMAIL_REFRESH_TOKEN (Camino A) en backend/.env."
            )
        self._service = build("gmail", "v1", credentials=creds, cache_discovery=False)

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
        parsed = parse_gmail_message(raw)
        parsed["images"] = self._download_images(message_id, parsed.pop("attachments", []))
        return parsed

    def _download_images(
        self, message_id: str, attachments: list[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        """Baja los bytes de cada imagen (inline o por attachmentId)."""
        images: list[dict[str, Any]] = []
        for att in attachments[:MAX_IMAGES]:
            data_b64 = att.get("data")
            if not data_b64 and att.get("attachment_id"):
                resp = (
                    self._service.users()
                    .messages()
                    .attachments()
                    .get(userId=self._user, messageId=message_id, id=att["attachment_id"])
                    .execute()
                )
                data_b64 = resp.get("data")
            if data_b64:
                images.append(
                    {
                        "nombre": att["nombre"],
                        "mime": att["mime"],
                        "data": base64.urlsafe_b64decode(data_b64),
                    }
                )
        return images

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
