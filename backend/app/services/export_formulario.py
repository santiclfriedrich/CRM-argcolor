"""Genera un PDF con los datos de un formulario (campo → valor), listo para
descargar. Se arma con WeasyPrint (HTML → PDF, ya en el stack)."""

import html as html_mod
from datetime import date

from app.services.presupuestos import _ensure_native_libs


def datos_a_pdf(
    titulo: str, campos: list[tuple[str, str]], notas: str | None = None
) -> bytes:
    """`campos` = [(etiqueta, valor)]. Devuelve el PDF en bytes."""
    _ensure_native_libs()
    from weasyprint import HTML

    e = html_mod.escape
    filas = "".join(
        "<tr>"
        f'<td class="lbl">{e(etiqueta)}</td>'
        f'<td class="val">{e(valor) if valor else "—"}</td>'
        "</tr>"
        for etiqueta, valor in campos
    )
    nota_html = (
        f'<p class="nota"><strong>Nota:</strong> {e(notas)}</p>' if notas else ""
    )
    hoy = date.today().strftime("%d/%m/%Y")
    html = f"""<!doctype html><html><head><meta charset="utf-8"><style>
      @page {{ size: A4; margin: 2cm; }}
      body {{ font-family: Arial, Helvetica, sans-serif; color: #0e1316; font-size: 12px; }}
      h1 {{ font-size: 18px; margin: 0 0 2px; }}
      .sub {{ color: #697178; font-size: 11px; margin: 0 0 16px; }}
      table {{ width: 100%; border-collapse: collapse; }}
      td {{ border: 1px solid #6b747b; padding: 6px 10px; vertical-align: top; }}
      td.lbl {{ width: 40%; color: #384249; background: #f1f2f3; font-weight: bold; }}
      td.val {{ white-space: pre-wrap; }}
      .nota {{ margin-top: 16px; font-size: 11px; color: #384249; }}
    </style></head><body>
      <h1>{e(titulo)}</h1>
      <p class="sub">Datos para completar · generado el {hoy}</p>
      <table>{filas}</table>
      {nota_html}
    </body></html>"""
    contenido: bytes = HTML(string=html).write_pdf()
    return contenido
