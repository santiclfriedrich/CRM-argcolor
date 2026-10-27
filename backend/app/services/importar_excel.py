"""Parseo del Excel de productos (de Compras) a ítems de presupuesto.

Template FIJO, parseo determinístico. Columnas esperadas (header en la 1ª fila,
match en minúscula sin espacios): `sku`, `descripcion`, `cantidad`, `precio_usd`,
`iva`, `fabricante`, `part_number`. Ideal: celdas numéricas puras (sin "USD"/"%"),
pero se toleran strings con formato es-AR.

Regla normal/manual: si la fila trae `sku` (código GBP) es NORMAL; si no, MANUAL
(y ahí el IVA importa: 21 o 10.5). La validación dura se hace al encolar a GBP.
"""

from __future__ import annotations

from decimal import Decimal, InvalidOperation
from io import BytesIO

from openpyxl import load_workbook

# Alias de encabezado -> campo. Se compara en minúscula y sin espacios de sobra.
_ALIASES: dict[str, set[str]] = {
    "sku": {"sku", "codigo gbp", "código gbp", "cod gbp", "codigo", "código"},
    "descripcion": {"descripcion", "descripción", "detalle", "producto"},
    "cantidad": {"cantidad", "cant", "cant.", "qty"},
    "precio_usd": {
        "precio_usd",
        "precio usd",
        "precio",
        "precio unitario",
        "venta unitario usd sin iva",
        "unitario",
        "costo",
        "costo unitario",
    },
    "iva": {"iva", "iva%", "iva %", "alicuota", "alícuota"},
    "moneda": {"moneda", "currency", "mon"},
    "fabricante": {"fabricante", "marca"},
    "part_number": {"part_number", "part number", "part n°", "part n", "pn", "part"},
}


def _norm_header(v: object) -> str:
    return str(v or "").strip().lower()


def _num(v: object) -> Decimal | None:
    """Convierte una celda a Decimal. Acepta número puro o string con formato
    es-AR ('USD 1.234,56', '21,00%'). Devuelve None si no se puede."""
    if v is None:
        return None
    if isinstance(v, (int, float, Decimal)):
        return Decimal(str(v))
    s = str(v).strip().replace("USD", "").replace("$", "").replace("%", "").strip()
    if not s:
        return None
    if "," in s and "." in s:  # es-AR: '.' miles, ',' decimal
        s = s.replace(".", "").replace(",", ".")
    elif "," in s:
        s = s.replace(",", ".")
    try:
        return Decimal(s)
    except InvalidOperation:
        return None


def _mapear_columnas(headers: list[object]) -> dict[str, int]:
    mapa: dict[str, int] = {}
    for idx, h in enumerate(headers):
        hn = _norm_header(h)
        for campo, alias in _ALIASES.items():
            if hn in alias and campo not in mapa:
                mapa[campo] = idx
    return mapa


def parsear_excel(contenido: bytes) -> list[dict[str, object]]:
    """Devuelve ítems (dicts con la forma de ItemBase). Lanza ValueError si el
    Excel no tiene las columnas mínimas o no hay filas válidas."""
    try:
        wb = load_workbook(BytesIO(contenido), data_only=True, read_only=True)
    except Exception as exc:  # noqa: BLE001 - archivo inválido
        raise ValueError("No se pudo leer el Excel (¿es un .xlsx válido?)") from exc

    ws = wb.active
    filas = list(ws.iter_rows(values_only=True))
    wb.close()
    if not filas:
        raise ValueError("El Excel está vacío")

    cols = _mapear_columnas(list(filas[0]))
    if "descripcion" not in cols:
        raise ValueError(
            "No encuentro la columna 'descripcion'. Usá el template "
            "(sku, descripcion, cantidad, precio, moneda, iva, fabricante, part_number)."
        )

    def celda(fila: tuple, campo: str) -> object:
        i = cols.get(campo)
        return fila[i] if i is not None and i < len(fila) else None

    items: list[dict[str, object]] = []
    for fila in filas[1:]:
        if not any(c is not None and str(c).strip() for c in fila):
            continue  # fila vacía
        desc = str(celda(fila, "descripcion") or "").strip()
        if not desc:
            continue
        cantidad = _num(celda(fila, "cantidad")) or Decimal(1)
        precio = _num(celda(fila, "precio_usd")) or Decimal(0)
        iva = _num(celda(fila, "iva"))
        if iva is not None and iva < 1:  # vino como 0.21 -> 21
            iva = iva * 100
        sku = str(celda(fila, "sku") or "").strip() or None
        mon = str(celda(fila, "moneda") or "").strip().upper()
        moneda = "ARS" if mon.startswith("AR") or mon in {"$", "PESOS", "PESO"} else "USD"
        items.append(
            {
                "descripcion": desc,
                "cantidad": cantidad,
                "precio_unitario": precio,
                "moneda": moneda,
                "iva": iva,
                "sku": sku,
                "fabricante": str(celda(fila, "fabricante") or "").strip() or None,
                "part_number": str(celda(fila, "part_number") or "").strip() or None,
            }
        )

    if not items:
        raise ValueError("El Excel no tiene filas de productos válidas")
    return items
