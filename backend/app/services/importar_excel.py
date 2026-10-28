"""Parseo + validación del Excel de productos a ítems de presupuesto.

Template por NOMBRE de columna (no por posición), comparado sin espacios, sin
mayúsculas y sin tildes. Columnas: SKU, Descripción, Part Number (se ignora),
Cantidad, Precio Unitario (o "Precio"), Moneda, IVA %.

Precio = NETO de venta. Si el archivo trae "Costo" y no "Precio Unitario", se
rechaza (para no cotizar al costo por usar una planilla vieja).

Regla normal/manual: con SKU = NORMAL (en GBP el IVA lo trae el artículo); sin SKU
= MANUAL (ahí el IVA importa: 21 o 10.5).

`parsear_y_validar` junta TODOS los errores por fila (con el N° de fila del Excel);
si hay al menos uno, el caller no debe crear/encolar nada.
"""

from __future__ import annotations

import unicodedata
from decimal import Decimal, InvalidOperation
from io import BytesIO

from openpyxl import load_workbook

# Alias de encabezado (ya normalizados: minúscula, sin tildes) -> campo.
_ALIASES: dict[str, set[str]] = {
    "sku": {"sku", "codigo gbp", "cod gbp", "codigo"},
    "descripcion": {"descripcion", "detalle", "producto"},
    "cantidad": {"cantidad", "cant", "cant.", "qty"},
    "precio": {"precio unitario", "precio_unitario", "precio", "precio usd", "unitario"},
    "moneda": {"moneda", "currency", "mon"},
    "iva": {"iva", "iva%", "iva %", "alicuota"},
    "part_number": {"part number", "part_number", "part n", "part n°", "pn"},
}
_IVA_VALIDOS = (Decimal("21"), Decimal("10.5"))


def _norm_header(v: object) -> str:
    s = str(v or "").strip().lower()
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))


def _num(v: object) -> Decimal | None:
    if v is None:
        return None
    if isinstance(v, (int, float, Decimal)):
        return Decimal(str(v))
    s = str(v).strip()
    for sacar in ("USD", "ARS", "$", "%"):
        s = s.replace(sacar, "")
    s = s.strip()
    if not s:
        return None
    if "," in s and "." in s:
        s = s.replace(".", "").replace(",", ".")
    elif "," in s:
        s = s.replace(",", ".")
    try:
        return Decimal(s)
    except InvalidOperation:
        return None


def parsear_y_validar(
    contenido: bytes, *, umbral_usd: int = 20000
) -> tuple[list[dict[str, object]], list[dict[str, object]]]:
    """Devuelve (items, errores). `errores` = [{"fila": n, "mensaje": "..."}].
    Lanza ValueError si el archivo no se puede leer o le faltan columnas clave."""
    try:
        wb = load_workbook(BytesIO(contenido), data_only=True, read_only=True)
    except Exception as exc:  # noqa: BLE001 - archivo inválido
        raise ValueError("No se pudo leer el Excel (¿es un .xlsx válido?)") from exc
    ws = wb.active
    filas = list(ws.iter_rows(values_only=True))
    wb.close()
    if not filas:
        raise ValueError("El Excel está vacío")

    headers = [_norm_header(h) for h in filas[0]]
    cols: dict[str, int] = {}
    for i, h in enumerate(headers):
        for campo, alias in _ALIASES.items():
            if h in alias and campo not in cols:
                cols[campo] = i

    if "precio" not in cols:
        if "costo" in headers:
            raise ValueError(
                "El archivo trae 'Costo' en vez de 'Precio Unitario'. Revisá que los "
                "valores sean precios de venta netos y renombrá la columna."
            )
        raise ValueError("Falta la columna 'Precio Unitario'.")
    for req, nombre in (("descripcion", "Descripción"), ("cantidad", "Cantidad"),
                        ("moneda", "Moneda"), ("iva", "IVA %")):
        if req not in cols:
            raise ValueError(f"Falta la columna '{nombre}'.")

    def celda(fila: tuple, campo: str) -> object:
        i = cols.get(campo)
        return fila[i] if i is not None and i < len(fila) else None

    items: list[dict[str, object]] = []
    errores: list[dict[str, object]] = []
    for idx, fila in enumerate(filas[1:], start=2):  # fila 1 = encabezado
        if not any(c is not None and str(c).strip() for c in fila):
            continue  # fila totalmente vacía
        err: list[str] = []
        sku = (str(celda(fila, "sku") or "").strip().upper()) or None
        desc = str(celda(fila, "descripcion") or "").strip()
        if sku is None and not desc:
            err.append("falta descripción")

        cant = _num(celda(fila, "cantidad"))
        if cant is None or cant <= 0 or cant != cant.to_integral_value():
            err.append("la cantidad debe ser un entero mayor que 0")

        precio = _num(celda(fila, "precio"))
        if precio is None or precio <= 0:
            err.append("el precio debe ser mayor que 0")
        else:
            precio = precio.quantize(Decimal("0.01"))

        mon = str(celda(fila, "moneda") or "").strip().upper()
        if mon not in ("ARS", "USD"):
            err.append(f"moneda inválida ('{mon}'): debe ser ARS o USD")

        iva_raw = _num(celda(fila, "iva"))
        iva: Decimal | None = None
        if iva_raw is None:
            err.append("falta el IVA")
        else:
            if iva_raw < 1:
                iva_raw = iva_raw * 100
            iva = iva_raw.quantize(Decimal("0.1"))
            if iva not in _IVA_VALIDOS:
                err.append(f"IVA inválido ({iva}): solo 21 o 10.5")

        if mon == "USD" and precio is not None and precio > umbral_usd:
            err.append(f"¿precio en pesos marcado como USD? ({precio} supera {umbral_usd})")

        if err:
            errores.append({"fila": idx, "mensaje": "; ".join(err)})
            continue

        items.append(
            {
                "descripcion": desc or sku,  # normal sin descripción -> el SKU
                "cantidad": cant,
                "precio_unitario": precio,
                "moneda": mon,
                "iva": iva,
                "sku": sku,
                "fabricante": None,
                "part_number": str(celda(fila, "part_number") or "").strip() or None,
                "fila_excel": idx,  # fila real del Excel (1-based, encabezado = 1)
            }
        )

    if not items and not errores:
        raise ValueError("El Excel no tiene filas de productos")
    return items, errores
