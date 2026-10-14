"""Leer y rellenar PDFs con campos de formulario (AcroForm) usando pypdf."""

import io

from pypdf import PdfReader, PdfWriter


def leer_campos(data: bytes) -> list[dict[str, str]]:
    """Campos del PDF rellenable: [{"name", "label"}]. Vacío si el PDF es plano."""
    reader = PdfReader(io.BytesIO(data))
    fields = reader.get_fields() or {}
    campos: list[dict[str, str]] = []
    for name, f in fields.items():
        # /TU = nombre alternativo / tooltip (suele ser la etiqueta legible).
        label = ""
        try:
            label = str(f.get("/TU") or "") if hasattr(f, "get") else ""
        except Exception:  # noqa: BLE001 - metadata del PDF poco confiable
            label = ""
        campos.append({"name": str(name), "label": label or str(name)})
    return campos


def tiene_campos(data: bytes) -> bool:
    try:
        return bool(leer_campos(data))
    except Exception:  # noqa: BLE001 - PDF corrupto/ilegible
        return False


def rellenar(data: bytes, valores: dict[str, str]) -> bytes:
    """Escribe `valores` ({nombre_campo: valor}) en el PDF y devuelve los bytes."""
    reader = PdfReader(io.BytesIO(data))
    writer = PdfWriter()
    writer.append(reader)
    limpio = {k: v for k, v in valores.items() if v}
    for page in writer.pages:
        try:
            writer.update_page_form_field_values(page, limpio)
        except Exception:  # noqa: BLE001 - campos que no están en esa página
            continue
    # Para que los visores muestren los valores recién escritos.
    try:
        writer.set_need_appearances_writer(True)
    except Exception:  # noqa: BLE001 - según versión de pypdf
        pass
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()
