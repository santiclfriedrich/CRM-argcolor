"""Tests del parser + validación del Excel de productos."""

from decimal import Decimal
from io import BytesIO

import pytest
from openpyxl import Workbook

from app.services.importar_excel import parsear_y_validar


def _xlsx(rows: list[list]) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "Detalle Items"
    for r in rows:
        ws.append(r)
    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()


_HDR = ["SKU", "Descripción", "Part Number", "Cantidad", "Precio", "Moneda", "IVA %"]


def test_parsea_normales_y_manuales() -> None:
    data = _xlsx(
        [
            _HDR,
            ["NSVC60P", "Aspiradora 60W", "PN1", 2, 36, "USD", 0.21],  # normal
            [None, "Flete", None, 1, 5000, "ARS", 0.21],  # manual
        ]
    )
    items, errores = parsear_y_validar(data)
    assert errores == []
    assert len(items) == 2
    assert items[0]["sku"] == "NSVC60P" and items[0]["iva"] == Decimal("21")
    assert items[0]["precio_unitario"] == Decimal("36.00")
    assert items[1]["sku"] is None  # manual


def test_rechaza_costo_sin_precio_unitario() -> None:
    data = _xlsx([["SKU", "Descripción", "Cantidad", "Costo", "Moneda", "IVA %"],
                  ["X", "Algo", 1, 10, "USD", 0.21]])
    with pytest.raises(ValueError, match="Costo"):
        parsear_y_validar(data)


def test_normaliza_iva_fraccion_y_redondea_precio() -> None:
    data = _xlsx([_HDR, ["X", "D", None, 1, 1234.567, "ARS", 0.105]])
    items, errores = parsear_y_validar(data)
    assert errores == []
    assert items[0]["iva"] == Decimal("10.5")
    assert items[0]["precio_unitario"] == Decimal("1234.57")  # 2 decimales


def test_junta_todos_los_errores_con_fila() -> None:
    data = _xlsx(
        [
            _HDR,
            ["X", "ok", None, 1, 10, "USD", 0.21],        # fila 2: ok
            [None, "", None, 0, -5, "EUR", 0.3],          # fila 3: varios errores
            ["Y", "ok2", None, 2.5, 10, "ARS", 0.21],     # fila 4: cantidad no entera
        ]
    )
    items, errores = parsear_y_validar(data)
    assert len(items) == 1  # solo la fila 2 válida
    filas = {e["fila"] for e in errores}
    assert filas == {3, 4}
    msg3 = next(e["mensaje"] for e in errores if e["fila"] == 3)
    assert "descripción" in msg3 and "cantidad" in msg3 and "moneda" in msg3


def test_control_usd_mayor_a_umbral() -> None:
    data = _xlsx([_HDR, ["X", "Caro", None, 1, 25000, "USD", 0.21]])
    _, errores = parsear_y_validar(data, umbral_usd=20000)
    assert len(errores) == 1
    assert "USD" in errores[0]["mensaje"]


def test_moneda_por_item() -> None:
    data = _xlsx([_HDR, ["A", "x", None, 1, 10, "usd", 0.21], ["B", "y", None, 1, 10, "ars", 0.21]])
    items, errores = parsear_y_validar(data)
    assert errores == []
    assert items[0]["moneda"] == "USD" and items[1]["moneda"] == "ARS"
