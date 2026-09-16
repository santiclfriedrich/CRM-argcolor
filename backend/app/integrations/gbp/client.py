"""Conector de lectura al ERP GlobalBluePoint (GBP) vía SOAP 1.1.

Sync ONE-WAY: solo operaciones de lectura (auth + listado de clientes). Nunca
se ejecutan operaciones de escritura contra el ERP.

Las credenciales vienen de variables de entorno (ver app/config.py: GBP_*).
La parte de parseo de XML (`parse_tables`) es pura y testeable sin red.
"""

from __future__ import annotations

import logging
import re
import xml.etree.ElementTree as ET
from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor
from xml.sax.saxutils import escape

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)

# Caracteres de control ilegales en XML 1.0 (el ERP a veces los mete en el texto).
_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")

_PAGE_SIZE = 500  # el WS pagina de a 500 clientes
# Páginas que se bajan en paralelo (la paginación es por número → se puede).
# Conservador para no saturar el ERP; ajustable por env GBP_FETCH_CONCURRENCY.
_CONCURRENCIA_DEFAULT = 5


def _local(tag: str) -> str:
    """Devuelve el nombre de tag sin namespace ('{ns}Table' -> 'Table')."""
    return tag.rsplit("}", 1)[-1]


def _clean(xml_text: str) -> str:
    return _CONTROL_CHARS.sub("", xml_text)


def parse_tables(result: str) -> list[dict[str, str]]:
    """Parsea el contenido de un *Result de GBP y devuelve una lista de dicts,
    uno por nodo <Table> (un cliente). Tolera dos formas:

    - El result es un string con XML (``<NewDataSet><Table>…``), a veces escapado.
    - El result ya trae los nodos anidados como XML real.

    Cualquier basura de control se limpia antes de parsear.
    """
    if not result or not result.strip():
        return []
    texto = _clean(result).strip()
    try:
        root = ET.fromstring(texto)
    except ET.ParseError:
        # Envolver por si vinieran varios nodos hermanos sin raíz única.
        root = ET.fromstring(f"<root>{texto}</root>")

    filas: list[dict[str, str]] = []
    for tabla in root.iter():
        if _local(tabla.tag) != "Table":
            continue
        fila: dict[str, str] = {}
        for campo in tabla:
            fila[_local(campo.tag)] = (campo.text or "").strip()
        if fila:
            filas.append(fila)
    return filas


class GBPClient:
    """Cliente SOAP mínimo del Web Service de consultas de GBP."""

    def __init__(self) -> None:
        s = get_settings()
        self._url = s.GBP_WS_URL
        self._ns = s.GBP_NAMESPACE
        self._user = s.GBP_USER
        self._pwd = s.GBP_PWD
        self._company = s.GBP_COMPANY
        self._ws = s.GBP_WS
        self._verify = s.GBP_VERIFY_SSL
        self._concurrencia = max(1, int(getattr(s, "GBP_FETCH_CONCURRENCY", _CONCURRENCIA_DEFAULT)))
        self._token: str | None = None
        # Conexión persistente (keep-alive) reutilizada en todas las páginas:
        # evita rehacer el handshake TLS en cada request. httpx.Client es
        # thread-safe, así que sirve para las descargas en paralelo.
        self._http = httpx.Client(verify=self._verify, timeout=120)

    def close(self) -> None:
        self._http.close()

    def __enter__(self) -> GBPClient:
        return self

    def __exit__(self, *_exc) -> None:  # noqa: ANN002
        self.close()

    # --- construcción del sobre SOAP ---
    def _header(self, *, autenticado: bool) -> str:
        token = (
            f"<pAuthenticatedToken>{escape(self._token or '')}</pAuthenticatedToken>"
            if autenticado
            else ""
        )
        return (
            f'<wsBasicQueryHeader xmlns="{self._ns}">'
            f"<pUsername>{escape(self._user)}</pUsername>"
            f"<pPassword>{escape(self._pwd)}</pPassword>"
            f"<pCompany>{escape(self._company)}</pCompany>"
            f"<pWebWervice>{escape(self._ws)}</pWebWervice>"
            f"{token}"
            f"</wsBasicQueryHeader>"
        )

    def _envelope(self, *, autenticado: bool, body_inner: str) -> str:
        return (
            '<?xml version="1.0" encoding="utf-8"?>'
            '<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" '
            'xmlns:xsd="http://www.w3.org/2001/XMLSchema" '
            'xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">'
            f"<soap:Header>{self._header(autenticado=autenticado)}</soap:Header>"
            f"<soap:Body>{body_inner}</soap:Body>"
            "</soap:Envelope>"
        )

    def _call(self, action: str, body_inner: str, *, autenticado: bool) -> str:
        """Ejecuta una operación SOAP y devuelve el texto del elemento *Result."""
        envelope = self._envelope(autenticado=autenticado, body_inner=body_inner)
        headers = {
            "Content-Type": "text/xml; charset=utf-8",
            "SOAPAction": f"{self._ns}{action}",
        }
        resp = self._http.post(self._url, content=envelope.encode("utf-8"), headers=headers)
        resp.raise_for_status()
        root = ET.fromstring(_clean(resp.text))
        for el in root.iter():
            if _local(el.tag) == f"{action}Result":
                # El result puede traer texto (XML escapado) o nodos anidados.
                if len(el) > 0:
                    return "".join(ET.tostring(c, encoding="unicode") for c in el)
                return el.text or ""
        return ""

    # --- operaciones ---
    def authenticate(self) -> str:
        """Obtiene el token (GUID, válido 60 min) y lo guarda para reinyectar."""
        body = f'<AuthenticateUser xmlns="{self._ns}" />'
        result = self._call("AuthenticateUser", body, autenticado=False)
        token = (result or "").strip()
        if "WARNING" in token.upper() or not _parece_guid(token):
            raise RuntimeError(
                "Autenticación GBP falló (¿URL o usuario incorrectos?). "
                f"Respuesta: {token[:120]!r}"
            )
        self._token = token
        return token

    def fetch_customers_page(self, page_number: int) -> list[dict[str, str]]:
        """Trae una página (500) de clientes de TODAS las sucursales."""
        if self._token is None:
            self.authenticate()
        body = (
            f'<Customers_funGetXMLData xmlns="{self._ns}">'
            "<pbra_id>-1</pbra_id>"
            "<pcust_id>-1</pcust_id>"
            f"<ppage_number>{page_number}</ppage_number>"
            "</Customers_funGetXMLData>"
        )
        return parse_tables(self._call("Customers_funGetXMLData", body, autenticado=True))

    def fetch_customer(self, cust_id: int) -> dict[str, str] | None:
        """Trae UN cliente por su `cust_id` (o None si no existe). Rápido (~0.3s),
        base del sync incremental por id."""
        if self._token is None:
            self.authenticate()
        body = (
            f'<Customers_funGetXMLData xmlns="{self._ns}">'
            "<pbra_id>-1</pbra_id>"
            f"<pcust_id>{int(cust_id)}</pcust_id>"
            "<ppage_number>0</ppage_number>"
            "</Customers_funGetXMLData>"
        )
        filas = parse_tables(self._call("Customers_funGetXMLData", body, autenticado=True))
        return filas[0] if filas else None

    # --- ESCRITURA: alta de clientes (flujo bidireccional CRM -> GBP) ---
    def buscar_por_cuit(self, cuit: str) -> list[dict[str, str]]:
        """Dedup previo al alta: busca clientes por CUIT (con guiones)."""
        if self._token is None:
            self.authenticate()
        body = (
            f'<CustomersByTaxNumber_funGetXMLData xmlns="{self._ns}">'
            f"<strTaxNumber>{escape(cuit)}</strTaxNumber>"
            "</CustomersByTaxNumber_funGetXMLData>"
        )
        return parse_tables(
            self._call("CustomersByTaxNumber_funGetXMLData", body, autenticado=True)
        )

    def fetch_states(self, country: str = "54") -> list[dict[str, str]]:
        """Provincias del país (Argentina=54): state_id + nombre, para mapear."""
        if self._token is None:
            self.authenticate()
        body = (
            f'<States_funGetXMLData xmlns="{self._ns}">'
            f"<pCountry>{escape(country)}</pCountry>"
            "</States_funGetXMLData>"
        )
        return parse_tables(self._call("States_funGetXMLData", body, autenticado=True))

    def crear_cliente(
        self,
        *,
        name: str,
        state: str,
        address: str,
        city: str,
        zip: str,  # noqa: A002 - nombre del parámetro del WS
        fiscalclass: str,
        taxnumbertype: str,
        taxnumber: str,
        email: str,
        phone: str,
        country: str = "54",
        nickname: str = "",
        pass1: str = "",
        pass2: str = "",
    ) -> str:
        """Da de alta un cliente (Customers_setNEWCustomer). Devuelve el texto del
        resultado: el nuevo cust_id (entero positivo) o un código negativo si falló."""
        if self._token is None:
            self.authenticate()
        # El orden de los elementos respeta el del WSDL del WS.
        campos = {
            "pname": name,
            "pcountry": country,
            "pstate": state,
            "paddress": address,
            "pcity": city,
            "pzip": zip,
            "pfiscalclass": fiscalclass,
            "ptaxnumbertype": taxnumbertype,
            "ptaxnumber": taxnumber,
            "pemail": email,
            "pphone": phone,
            "pnickname": nickname,
            "ppass1": pass1,
            "ppass2": pass2,
        }
        inner = "".join(f"<{k}>{escape(v or '')}</{k}>" for k, v in campos.items())
        body = f'<Customers_setNEWCustomer xmlns="{self._ns}">{inner}</Customers_setNEWCustomer>'
        return (self._call("Customers_setNEWCustomer", body, autenticado=True) or "").strip()

    def set_clase_cliente(self, cust_id: int, ck_id: int) -> list[dict[str, str]]:
        """Setea la Clase de Cliente (ck_id) vía el GBPScript BI.SetClaseCliente."""
        if self._token is None:
            self.authenticate()
        import json

        params = json.dumps({"cust_id": int(cust_id), "ck_id": int(ck_id)})
        body = (
            f'<wsGBPScriptExecute4Dataset xmlns="{self._ns}">'
            "<strScriptLabel>BI.SetClaseCliente</strScriptLabel>"
            f"<strJSonParameters>{escape(params)}</strJSonParameters>"
            "</wsGBPScriptExecute4Dataset>"
        )
        return parse_tables(self._call("wsGBPScriptExecute4Dataset", body, autenticado=True))

    def iter_pages(self) -> Iterator[list[dict[str, str]]]:
        """Itera las PÁGINAS de clientes del ERP (cada una es una lista de filas).

        Baja las páginas en **lotes concurrentes** (el WS pagina por número, así
        que se pueden pedir varias a la vez) para acortar el tiempo total, que
        está dominado por la latencia de red del ERP. Igual las entrega EN ORDEN
        y de a una, así el consumidor puede commitear entre páginas sin mantener
        una transacción abierta durante el fetch del próximo lote.
        """
        # Autenticar una sola vez ANTES de disparar las requests concurrentes
        # (si no, todas verían token=None y autenticarían en paralelo).
        if self._token is None:
            self.authenticate()

        k = self._concurrencia
        page = 0
        with ThreadPoolExecutor(max_workers=k) as pool:
            while True:
                nums = list(range(page, page + k))
                lotes = list(pool.map(self.fetch_customers_page, nums))
                fin = False
                for filas in lotes:
                    if not filas:
                        fin = True
                        break
                    yield filas
                    if len(filas) < _PAGE_SIZE:
                        fin = True  # última página; el resto del lote sobra
                        break
                if fin:
                    break
                page += k

    def iter_customers(self) -> Iterator[dict[str, str]]:
        """Itera TODOS los clientes del ERP (aplana las páginas)."""
        for filas in self.iter_pages():
            yield from filas


def _parece_guid(valor: str) -> bool:
    return bool(
        re.fullmatch(
            r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}",
            valor.strip(),
        )
    )
