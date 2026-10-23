"""Tests del parser del Excel de productos (template fijo)."""

from decimal import Decimal
from io import BytesIO

import pytest
from openpyxl import Workbook

from app.services.importar_excel import parsear_excel


def _xlsx(rows: list[list]) -> bytes:
    wb = Workbook()
    ws = wb.active
    for r in rows:
        ws.append(r)
    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()


def test_parsea_template_fijo() -> None:
    data = _xlsx(
        [
            ["sku", "descripcion", "cantidad", "precio_usd", "iva", "fabricante", "part_number"],
            ["NSVC60P", "Aspiradora 60W", 1, 36, None, "Nisuta", "NSVC60P"],
            [None, "Flete", 2, 40, 21, None, None],
        ]
    )
    items = parsear_excel(data)
    assert len(items) == 2
    assert items[0]["sku"] == "NSVC60P"  # con SKU -> normal
    assert items[0]["precio_unitario"] == Decimal("36")
    assert items[1]["sku"] is None  # sin SKU -> manual
    assert items[1]["cantidad"] == Decimal("2")
    assert items[1]["iva"] == Decimal("21")


def test_ignora_filas_vacias_y_sin_descripcion() -> None:
    data = _xlsx(
        [
            ["sku", "descripcion", "cantidad", "precio_usd"],
            ["X1", "Algo", 1, 10],
            [None, None, None, None],
            ["X2", "", 1, 5],  # sin descripción -> se saltea
        ]
    )
    items = parsear_excel(data)
    assert len(items) == 1


def test_sin_columna_descripcion_es_error() -> None:
    data = _xlsx([["sku", "cantidad"], ["X", 1]])
    with pytest.raises(ValueError):
        parsear_excel(data)


def test_iva_en_fraccion_se_normaliza() -> None:
    data = _xlsx([["descripcion", "cantidad", "precio_usd", "iva"], ["Flete", 1, 40, 0.21]])
    items = parsear_excel(data)
    assert items[0]["iva"] == Decimal("21")


def test_tolera_strings_formato_es_ar() -> None:
    data = _xlsx(
        [["descripcion", "cantidad", "precio_usd"], ["Caja", "3", "USD 1.234,56"]]
    )
    items = parsear_excel(data)
    assert items[0]["cantidad"] == Decimal("3")
    assert items[0]["precio_unitario"] == Decimal("1234.56")


def test_moneda_por_item() -> None:
    data = _xlsx(
        [
            ["descripcion", "precio", "moneda"],
            ["Item USD", 10, "USD"],
            ["Item ARS", 5000, "ARS"],
            ["Item sin moneda", 7, None],  # default USD
        ]
    )
    items = parsear_excel(data)
    assert items[0]["moneda"] == "USD"
    assert items[1]["moneda"] == "ARS"
    assert items[2]["moneda"] == "USD"
