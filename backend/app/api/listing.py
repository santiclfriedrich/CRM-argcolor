"""Helper para listados con tope de seguridad.

Ningún listado pagina todavía (ver evaluación de paginación). Como red de
seguridad para que una tabla que crece no vuelva a inflar el egress de Neon,
los listados grandes traen como mucho ``LIST_CAP`` filas (las más nuevas). El
tope es holgado para el uso real; si alguna vez se alcanza, se loguea un aviso
para que sea señal de "toca implementar paginación real", no una truncación
silenciosa.
"""

import logging

from sqlalchemy import Select
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

# Tope holgado: hoy los listados están en cientos de filas. Si se alcanza, es
# momento de paginación server-side real en esa sección.
LIST_CAP = 1000


def scalars_capped(db: Session, query: Select, etiqueta: str, cap: int = LIST_CAP) -> list:
    """Ejecuta la query con un tope y avisa por log si se alcanzó."""
    filas = list(db.scalars(query.limit(cap)))
    if len(filas) >= cap:
        logger.warning(
            "Listado '%s' alcanzó el tope de %s filas; puede faltar data. "
            "Implementar paginación server-side en esa sección.",
            etiqueta,
            cap,
        )
    return filas
