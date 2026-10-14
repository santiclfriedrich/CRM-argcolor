"""Estampado de texto sobre un PDF plano: dada una lista de posiciones (en
fracciones 0..1 de la página, origen arriba-izquierda) escribe el valor encima y
devuelve el PDF resultante. Capa de texto con reportlab, merge con pypdf.

Las coordenadas van normalizadas (0..1) para ser independientes del zoom con que
el editor visual muestre el PDF: el front manda fracciones, acá se pasan a puntos
según el tamaño real de cada página."""

import io

from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas


def estampar(data: bytes, posiciones: list[dict]) -> bytes:
    """`posiciones` = [{page, x, y, valor, size?}] con x,y en 0..1 (desde arriba-izq)."""
    reader = PdfReader(io.BytesIO(data))

    por_pagina: dict[int, list[dict]] = {}
    for p in posiciones:
        if not str(p.get("valor") or "").strip():
            continue
        por_pagina.setdefault(int(p.get("page", 0)), []).append(p)

    writer = PdfWriter()
    for i, page in enumerate(reader.pages):
        items = por_pagina.get(i)
        if items:
            w = float(page.mediabox.width)
            h = float(page.mediabox.height)
            buf = io.BytesIO()
            c = canvas.Canvas(buf, pagesize=(w, h))
            for p in items:
                fx = min(max(float(p.get("x", 0)), 0.0), 1.0)
                fy = min(max(float(p.get("y", 0)), 0.0), 1.0)
                size = float(p.get("size") or 10)
                x = fx * w
                # (fx, fy) es la esquina SUPERIOR-izquierda del texto (igual que el
                # marcador del editor). La baseline va ~0.8*size debajo del tope;
                # el PDF tiene el origen abajo-izquierda, por eso restamos de h.
                y = h - (fy * h) - size * 0.8
                c.setFont("Helvetica", size)
                c.drawString(x, y, str(p["valor"]))
            c.save()
            buf.seek(0)
            page.merge_page(PdfReader(buf).pages[0])
        writer.add_page(page)

    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()
