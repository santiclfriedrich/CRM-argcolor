"""Cliente de Gmail API (Camino A: OAuth refresh token de la casilla comercial).

Lectura entrante para el polling de la bandeja. El envío saliente (acuse de
recibo) se agrega en el Slice 4. El parsing de mensajes es una función pura
(`parse_gmail_message`) para poder testearlo sin tocar la API.
"""

import base64
import logging
import re
from datetime import datetime, timezone
from email.message import EmailMessage
from email.utils import parseaddr
from html.parser import HTMLParser
from typing import Any

from google.oauth2 import service_account
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from app.config import settings

logger = logging.getLogger(__name__)

# readonly para leer; send queda pedido de antemano para el acuse (Slice 4).
GMAIL_SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
]
_TOKEN_URI = "https://oauth2.googleapis.com/token"


def _decode_body(data: str) -> str:
    return base64.urlsafe_b64decode(data.encode()).decode("utf-8", errors="replace")


class _HTMLToText(HTMLParser):
    """Extrae texto legible de un HTML (stdlib, sin dependencias extra)."""

    _BLOCK = {"p", "div", "tr", "table", "li", "ul", "ol", "h1", "h2", "h3", "br"}
    _SKIP = {"style", "script", "head", "title"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._out: list[str] = []
        self._skip_depth = 0

    def handle_starttag(self, tag: str, attrs: list) -> None:  # noqa: ANN001
        if tag in self._SKIP:
            self._skip_depth += 1
        elif tag in self._BLOCK:
            self._out.append("\n")

    def handle_startendtag(self, tag: str, attrs: list) -> None:  # noqa: ANN001
        if tag in self._BLOCK:
            self._out.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in self._SKIP and self._skip_depth:
            self._skip_depth -= 1
        elif tag in self._BLOCK:
            self._out.append("\n")

    def handle_data(self, data: str) -> None:
        if self._skip_depth == 0:
            self._out.append(data)

    def get_text(self) -> str:
        # Colapsa espacios por línea y comprime líneas en blanco consecutivas.
        lineas = [" ".join(ln.split()) for ln in "".join(self._out).splitlines()]
        limpio: list[str] = []
        for ln in lineas:
            if ln or (limpio and limpio[-1]):
                limpio.append(ln)
        return "\n".join(limpio).strip()


def _html_to_text(html: str) -> str:
    parser = _HTMLToText()
    parser.feed(html)
    return parser.get_text()


def _extract_text(payload: dict[str, Any]) -> str:
    """Devuelve el texto del mail recorriendo las partes MIME.

    Prefiere text/plain; si el mail viene solo en HTML, lo convierte a texto
    legible (evita guardar/mandar a la IA el HTML crudo)."""
    mime = payload.get("mimeType", "")
    body = payload.get("body", {})
    if mime == "text/plain" and body.get("data"):
        return _decode_body(body["data"])
    if mime == "text/html" and body.get("data"):
        return _html_to_text(_decode_body(body["data"]))

    parts = payload.get("parts") or []
    for part in parts:  # preferimos text/plain directo
        if part.get("mimeType") == "text/plain" and part.get("body", {}).get("data"):
            return _decode_body(part["body"]["data"])
    for part in parts:  # si no, recursión (multipart anidado / text/html)
        text = _extract_text(part)
        if text:
            return text
    return ""


def _extract_html(payload: dict[str, Any]) -> str:
    """Devuelve el HTML crudo del mail (parte text/html), para renderizarlo tal
    cual en el detalle (tablas, formato, etc.). "" si el mail es solo texto."""
    mime = payload.get("mimeType", "")
    body = payload.get("body", {})
    if mime == "text/html" and body.get("data"):
        return _decode_body(body["data"])
    for part in payload.get("parts") or []:
        html = _extract_html(part)
        if html:
            return html
    return ""


def _collect_all_attachments(payload: dict[str, Any]) -> list[dict[str, Any]]:
    """Todos los adjuntos reales (con filename) del mail, para listarlos y bajarlos
    a demanda. No baja bytes: solo metadatos + attachment_id."""
    found: list[dict[str, Any]] = []

    def walk(part: dict[str, Any]) -> None:
        nombre = part.get("filename") or ""
        body = part.get("body", {})
        if nombre and body.get("attachmentId"):
            found.append(
                {
                    "filename": nombre,
                    "mime": part.get("mimeType") or "application/octet-stream",
                    "size": body.get("size") or 0,
                    "attachment_id": body.get("attachmentId"),
                }
            )
        for child in part.get("parts") or []:
            walk(child)

    walk(payload)
    return found


def _collect_inline_images(payload: dict[str, Any]) -> list[dict[str, Any]]:
    """Imágenes embebidas por Content-ID (cid:) — logos/firmas — para inlinearlas
    como data URI en el HTML y que se vean igual que en Gmail."""
    found: list[dict[str, Any]] = []

    def walk(part: dict[str, Any]) -> None:
        mime = part.get("mimeType", "")
        cid = _header(part.get("headers") or [], "Content-ID")
        body = part.get("body", {})
        if mime.startswith("image/") and cid and (body.get("attachmentId") or body.get("data")):
            found.append(
                {
                    "cid": cid.strip().lstrip("<").rstrip(">"),
                    "mime": mime,
                    "attachment_id": body.get("attachmentId"),
                    "data": body.get("data"),
                }
            )
        for child in part.get("parts") or []:
            walk(child)

    walk(payload)
    return found


def _header(headers: list[dict[str, str]], name: str) -> str | None:
    return next((h["value"] for h in headers if h["name"].lower() == name.lower()), None)


def _referencias(headers: list[dict[str, str]]) -> list[str]:
    """Message-IDs a los que este mail responde/reenvía (References + In-Reply-To).
    Son globales (no dependen de la casilla) -> sirven para enganchar una respuesta
    con la oportunidad del hilo aunque entre por otra casilla."""
    raw = " ".join(
        v for v in (_header(headers, "References"), _header(headers, "In-Reply-To")) if v
    )
    return re.findall(r"<[^>]+>", raw)


def _es_bulk(headers: list[dict[str, str]]) -> bool:
    """True si los headers son de un mail automático/masivo (newsletter,
    notificación de plataforma, respuesta automática): un mail humano 1:1 NO los
    trae. Sirve para filtrar sin mantener listas de remitentes."""
    if _header(headers, "List-Unsubscribe") or _header(headers, "List-Id"):
        return True
    if (_header(headers, "Precedence") or "").strip().lower() in ("bulk", "list", "junk"):
        return True
    auto = (_header(headers, "Auto-Submitted") or "").strip().lower()
    return bool(auto) and auto != "no"


# Máximo de imágenes a procesar por mail (corte defensivo de costo/payload).
MAX_IMAGES = 5
# Imágenes más chicas que esto se consideran logos/íconos de firma -> se saltean.
_MIN_IMG_BYTES = 15_000


def _es_imagen_de_firma(part: dict[str, Any]) -> bool:
    """Heurística: logos/sellos/tarjetas de una firma. Son imágenes EMBEBIDAS
    (inline, con Content-ID / disposition inline) o muy chicas. NO se mandan a la
    IA (no aportan al pedido y suman costo). Las fotos de producto que adjunta el
    cliente son attachment y más pesadas -> se conservan."""
    ph = part.get("headers", []) or []
    if _header(ph, "Content-ID"):
        return True
    if (_header(ph, "Content-Disposition") or "").strip().lower().startswith("inline"):
        return True
    size = part.get("body", {}).get("size") or 0
    return bool(size) and size < _MIN_IMG_BYTES


def _collect_image_attachments(payload: dict[str, Any]) -> list[dict[str, Any]]:
    """Metadatos de los adjuntos tipo imagen (recursivo sobre las partes MIME),
    salteando las imágenes de firma (logos/sellos)."""
    found: list[dict[str, Any]] = []

    def walk(part: dict[str, Any]) -> None:
        mime = part.get("mimeType", "")
        body = part.get("body", {})
        if (
            mime.startswith("image/")
            and (body.get("data") or body.get("attachmentId"))
            and not _es_imagen_de_firma(part)
        ):
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


# Máximo de documentos (PDF/planillas) a procesar por mail, y tope de tamaño
# (Gemini inline tiene un límite de payload; una planilla/PDF razonable entra).
MAX_DOCS = 4
_MAX_DOC_BYTES = 12_000_000


def _collect_document_attachments(payload: dict[str, Any]) -> list[dict[str, Any]]:
    """Metadatos de los adjuntos-documento (PDF, Excel .xlsx, CSV) que sabemos
    leer. Recursivo sobre las partes MIME. Los ítems a cotizar de un RFQ suelen
    venir acá, no en el cuerpo."""
    from app.services.documentos import es_documento_util

    found: list[dict[str, Any]] = []

    def walk(part: dict[str, Any]) -> None:
        mime = part.get("mimeType", "")
        nombre = part.get("filename") or ""
        body = part.get("body", {})
        tiene_datos = body.get("data") or body.get("attachmentId")
        # Solo adjuntos reales (con filename) que sepamos parsear.
        if nombre and tiene_datos and es_documento_util(mime, nombre):
            size = body.get("size") or 0
            if not size or size <= _MAX_DOC_BYTES:
                found.append(
                    {
                        "nombre": nombre,
                        "mime": mime or "application/octet-stream",
                        "attachment_id": body.get("attachmentId"),
                        "data": body.get("data"),
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
        "labels": msg.get("labelIds") or [],
        "rfc_message_id": _header(headers, "Message-ID"),
        "de": parseaddr(de_raw or "")[1] or de_raw,
        "para": _header(headers, "To"),
        "asunto": _header(headers, "Subject"),
        "cuerpo": _extract_text(payload) or msg.get("snippet", ""),
        "fecha": fecha,
        "es_automatico": _es_bulk(headers),
        "referencias": _referencias(headers),
        "attachments": _collect_image_attachments(payload),
        "document_attachments": _collect_document_attachments(payload),
    }


class GmailClient:
    """Wrapper de la Gmail API.

    - Camino A (refresh token): lee la casilla dueña del token (`user` se ignora).
    - Camino B (service account + delegation): impersona la casilla `user`.
    """

    def __init__(self, user: str | None = None, refresh_token: str | None = None) -> None:
        self._per_user = False
        if refresh_token:
            # Camino C (por cuenta): refresh token propio del vendedor, obtenido
            # con el OAuth del login -> se refresca con GOOGLE_CLIENT_ID/SECRET.
            creds = Credentials(
                token=None,
                refresh_token=refresh_token,
                client_id=settings.GOOGLE_CLIENT_ID,
                client_secret=settings.GOOGLE_CLIENT_SECRET,
                token_uri=_TOKEN_URI,
                scopes=GMAIL_SCOPES,
            )
            self._user = "me"
            self._per_user = True
        elif settings.GMAIL_SERVICE_ACCOUNT_FILE:
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

    def get_messages_bulk(self, ids: list[str]) -> list[dict[str, Any]]:
        """Trae varios mensajes en pocas llamadas (batch HTTP de Gmail, de a 100),
        SIN bajar los bytes de adjuntos. Es lo que usa el sync de buzón para no
        hacer una request por mail (lo que colgaba el botón Sincronizar)."""
        if not ids:
            return []
        parsed: dict[str, dict[str, Any]] = {}

        def _cb(request_id: str, response: dict[str, Any], exception: Exception | None) -> None:
            if exception is not None:
                logger.warning("Batch get del mail %s falló: %s", request_id, exception)
                return
            p = parse_gmail_message(response)
            p.pop("attachments", None)
            p.pop("document_attachments", None)
            p["images"] = []
            p["documentos"] = []
            parsed[request_id] = p

        for i in range(0, len(ids), 100):  # Gmail limita el batch a 100 requests
            batch = self._service.new_batch_http_request(callback=_cb)
            for mid in ids[i : i + 100]:
                batch.add(
                    self._service.users()
                    .messages()
                    .get(userId=self._user, id=mid, format="full"),
                    request_id=mid,
                )
            batch.execute()
        return [parsed[mid] for mid in ids if mid in parsed]

    def get_thread(self, thread_id: str) -> list[dict[str, Any]]:
        """Devuelve los mensajes de un hilo (parseados), en orden cronológico."""
        raw = (
            self._service.users()
            .threads()
            .get(userId=self._user, id=thread_id, format="full")
            .execute()
        )
        return [parse_gmail_message(m) for m in raw.get("messages", [])]

    def get_attachment_bytes(self, message_id: str, attachment_id: str) -> bytes:
        """Baja los bytes de un adjunto (a demanda, al abrir/descargar)."""
        resp = (
            self._service.users()
            .messages()
            .attachments()
            .get(userId=self._user, messageId=message_id, id=attachment_id)
            .execute()
        )
        data = resp.get("data", "")
        return base64.urlsafe_b64decode(data) if data else b""

    def get_thread_render(self, thread_id: str) -> list[dict[str, Any]]:
        """Trae el hilo con el HTML real de cada mail (imágenes inline embebidas
        como data URI) + metadatos de adjuntos. Para mostrar el detalle EXACTO
        como en Gmail. Es una lectura en vivo (no toca la DB)."""
        raw = (
            self._service.users()
            .threads()
            .get(userId=self._user, id=thread_id, format="full")
            .execute()
        )
        mensajes: list[dict[str, Any]] = []
        for m in raw.get("messages", []):
            payload = m.get("payload", {})
            headers = payload.get("headers", [])
            mid = m.get("id")
            html = _extract_html(payload)
            if html:
                for img in _collect_inline_images(payload):
                    try:
                        crudo = (
                            base64.urlsafe_b64decode(img["data"])
                            if img.get("data")
                            else self.get_attachment_bytes(mid, img["attachment_id"])
                        )
                    except Exception:  # noqa: BLE001 - una imagen rota no corta el mail
                        continue
                    if crudo:
                        uri = f"data:{img['mime']};base64,{base64.b64encode(crudo).decode()}"
                        html = html.replace(f"cid:{img['cid']}", uri)
            fecha = None
            if m.get("internalDate"):
                fecha = datetime.fromtimestamp(int(m["internalDate"]) / 1000, tz=timezone.utc)
            mensajes.append(
                {
                    "message_id": mid,
                    "de": _header(headers, "From"),
                    "para": _header(headers, "To"),
                    "asunto": _header(headers, "Subject"),
                    "fecha": fecha,
                    "html": html or None,
                    "texto": _extract_text(payload),
                    "adjuntos": [
                        {**a, "message_id": mid} for a in _collect_all_attachments(payload)
                    ],
                }
            )
        return mensajes

    def get_message(self, message_id: str, with_attachments: bool = True) -> dict[str, Any]:
        raw = (
            self._service.users()
            .messages()
            .get(userId=self._user, id=message_id, format="full")
            .execute()
        )
        parsed = parse_gmail_message(raw)
        if with_attachments:
            parsed["images"] = self._download_attachments(
                message_id, parsed.pop("attachments", []), MAX_IMAGES
            )
            parsed["documentos"] = self._download_attachments(
                message_id, parsed.pop("document_attachments", []), MAX_DOCS
            )
        else:
            # Sync de buzón (inbox): no bajamos los bytes de adjuntos (egress).
            parsed.pop("attachments", None)
            parsed.pop("document_attachments", None)
            parsed["images"] = []
            parsed["documentos"] = []
        return parsed

    def _download_attachments(
        self, message_id: str, attachments: list[dict[str, Any]], limite: int
    ) -> list[dict[str, Any]]:
        """Baja los bytes de cada adjunto (inline o por attachmentId)."""
        bajados: list[dict[str, Any]] = []
        for att in attachments[:limite]:
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
                bajados.append(
                    {
                        "nombre": att["nombre"],
                        "mime": att["mime"],
                        "data": base64.urlsafe_b64decode(data_b64),
                    }
                )
        return bajados

    def send_message(
        self,
        to: str,
        subject: str,
        body: str,
        thread_id: str | None = None,
        in_reply_to: str | None = None,
        cc: list[str] | None = None,
        attachments: list[dict[str, Any]] | None = None,
        html: str | None = None,
    ) -> dict[str, str | None]:
        """Envía un mail desde la casilla.

        - ``thread_id``: agrupa dentro del hilo de Gmail (solo si el hilo vive en
          esta casilla).
        - ``in_reply_to``: Message-ID (RFC) del mail al que se responde. Setea los
          headers ``In-Reply-To``/``References`` para que la respuesta se encadene
          en el cliente del destinatario aunque salga de otra casilla.
        - ``cc``: lista de destinatarios en copia.
        - ``attachments``: lista de {filename, content(bytes), mime} a adjuntar.
        - ``html``: cuerpo HTML opcional (multipart/alternative); ``body`` queda
          como texto plano de fallback.
        """
        message = EmailMessage()
        message["To"] = to
        if cc:
            message["Cc"] = ", ".join(cc)
        # En modo por-cuenta el From lo pone Gmail (la casilla autenticada).
        if not self._per_user and "@" in (settings.GMAIL_USER or ""):
            message["From"] = settings.GMAIL_USER
        message["Subject"] = subject
        if in_reply_to:
            message["In-Reply-To"] = in_reply_to
            message["References"] = in_reply_to
        message.set_content(body)
        if html:
            message.add_alternative(html, subtype="html")

        for att in attachments or []:
            maintype, _, subtype = (att.get("mime") or "application/octet-stream").partition("/")
            message.add_attachment(
                att["content"],
                maintype=maintype,
                subtype=subtype or "octet-stream",
                filename=att["filename"],
            )

        raw = base64.urlsafe_b64encode(message.as_bytes()).decode()

        def _send(body: dict[str, Any]) -> dict[str, str | None]:
            sent = self._service.users().messages().send(userId=self._user, body=body).execute()
            return {"message_id": sent.get("id"), "thread_id": sent.get("threadId")}

        if thread_id:
            try:
                return _send({"raw": raw, "threadId": thread_id})
            except HttpError as exc:
                # El hilo no existe en esta casilla (mail viejo o llegó a otra
                # casilla): reintentamos como mensaje nuevo en vez de fallar.
                if exc.resp.status != 404:
                    raise
        return _send({"raw": raw})
