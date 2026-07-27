"""Tests de lectura de adjuntos-documento (PDF/planillas) para la IA."""

import base64
import io

from app.integrations.gmail.client import (
    _collect_document_attachments,
    parse_gmail_message,
)
from app.services.documentos import (
    enriquecer_cuerpo,
    es_documento_util,
    es_pdf,
    es_planilla,
    planilla_a_texto,
)


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode()


def _xlsx_bytes(filas: list[list]) -> bytes:
    from openpyxl import Workbook

    wb = Workbook()
    ws = wb.active
    for fila in filas:
        ws.append(fila)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def test_clasificacion_por_mime_y_extension() -> None:
    assert es_pdf("application/pdf", None) is True
    assert es_pdf(None, "orden.PDF") is True
    assert es_planilla("text/csv", None) is True
    assert es_planilla(None, "items.xlsx") is True
    assert es_documento_util("application/pdf", "rfq.pdf") is True
    # No leemos imágenes ni ejecutables por acá.
    assert es_documento_util("image/png", "logo.png") is False
    assert es_documento_util("application/zip", "cosas.zip") is False


def test_planilla_csv_a_texto() -> None:
    data = "SKU,Descripción,Cantidad\nAB1,Pigmento rojo,100\n,,\nAB2,Pigmento azul,50\n".encode()
    texto = planilla_a_texto("items.csv", "text/csv", data)
    assert texto is not None
    assert "Pigmento rojo | 100" in texto
    assert "AB2 | Pigmento azul | 50" in texto


def test_planilla_xlsx_a_texto() -> None:
    data = _xlsx_bytes(
        [["SKU", "Descripción", "Cantidad"], ["AB1", "Termotanque 50L", 3]]
    )
    mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    texto = planilla_a_texto("rfq.xlsx", mime, data)
    assert texto is not None
    assert "Termotanque 50L" in texto
    assert "AB1" in texto


def test_enriquecer_cuerpo_anexa_planilla_y_saltea_pdf() -> None:
    documentos = [
        {"nombre": "items.csv", "mime": "text/csv", "data": b"SKU,Cant\nAB1,10\n"},
        {"nombre": "cond.pdf", "mime": "application/pdf", "data": b"%PDF-1.4 ..."},
    ]
    out = enriquecer_cuerpo("Cotizar la planilla adjunta", documentos)
    assert "Cotizar la planilla adjunta" in out
    assert "Planilla adjunta: items.csv" in out
    assert "AB1 | 10" in out
    # El PDF no se vuelca a texto acá (va nativo a la IA).
    assert "%PDF" not in out


def test_collect_document_attachments_filtra_tipos() -> None:
    payload = {
        "mimeType": "multipart/mixed",
        "parts": [
            {"mimeType": "text/plain", "body": {"data": "x"}},
            {
                "mimeType": "application/pdf",
                "filename": "rfq.pdf",
                "body": {"attachmentId": "a1", "size": 1000},
            },
            {
                "mimeType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "filename": "items.xlsx",
                "body": {"attachmentId": "a2", "size": 2000},
            },
            {  # imagen: no la agarra este colector (va por el de imágenes)
                "mimeType": "image/png",
                "filename": "logo.png",
                "body": {"attachmentId": "a3", "size": 3000},
            },
        ],
    }
    docs = _collect_document_attachments(payload)
    nombres = {d["nombre"] for d in docs}
    assert nombres == {"rfq.pdf", "items.xlsx"}


def test_parse_gmail_message_expone_document_attachments() -> None:
    raw = {
        "id": "m1",
        "threadId": "t1",
        "payload": {
            "mimeType": "multipart/mixed",
            "headers": [{"name": "From", "value": "cliente@x.com"}],
            "parts": [
                {"mimeType": "text/plain", "body": {"data": _b64(b"cotizar adjunto")}},
                {
                    "mimeType": "application/pdf",
                    "filename": "rfq.pdf",
                    "body": {"attachmentId": "a1", "size": 500},
                },
            ],
        },
    }
    parsed = parse_gmail_message(raw)
    assert len(parsed["document_attachments"]) == 1
    assert parsed["document_attachments"][0]["nombre"] == "rfq.pdf"
