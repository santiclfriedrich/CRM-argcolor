"""Test del motor de estampado de PDFs planos."""

import io

from pypdf import PdfReader
from reportlab.pdfgen import canvas

from app.services.estampado import estampar


def _pdf_vacio() -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(595, 842))  # A4 en puntos
    c.drawString(50, 800, "Formulario de prueba")
    c.save()
    return buf.getvalue()


def test_estampar_escribe_el_texto_en_el_pdf() -> None:
    out = estampar(
        _pdf_vacio(),
        [
            {"page": 0, "x": 0.2, "y": 0.3, "valor": "MERCADOS DIGITALES SA"},
            {"page": 0, "x": 0.2, "y": 0.4, "valor": "30-71737169-7"},
            {"page": 0, "x": 0.2, "y": 0.5, "valor": ""},  # vacío: se ignora
        ],
    )
    texto = PdfReader(io.BytesIO(out)).pages[0].extract_text()
    assert "MERCADOS DIGITALES SA" in texto
    assert "30-71737169-7" in texto
    # El texto original del formulario se conserva.
    assert "Formulario de prueba" in texto
