"""FastAPI application entrypoint."""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1.router import api_router
from app.config import settings
from app.core.exceptions import AppError, app_error_handler
from app.services.scheduler import start_scheduler, stop_scheduler

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    # Arranca el polling de Gmail si GMAIL_ENABLED=true; si no, no hace nada.
    start_scheduler()
    yield
    stop_scheduler()


app = FastAPI(
    title=settings.APP_NAME,
    version="0.1.0",
    docs_url="/docs",
    lifespan=lifespan,
)


# Catch-all: convierte cualquier excepción NO controlada en un 500 JSON. Sin
# esto, Starlette genera el 500 por FUERA del middleware de CORS y la respuesta
# sale sin 'Access-Control-Allow-Origin' -> el browser lo reporta como error de
# CORS (engañoso). Se registra primero para quedar por DENTRO de CORS, así el
# 500 pasa por CORS al salir y recibe los headers. (En una app interna exponemos
# un resumen del error para poder diagnosticar; el detalle completo va al log.)
@app.middleware("http")
async def errores_con_cors(request: Request, call_next):  # noqa: ANN001, ANN201
    try:
        return await call_next(request)
    except Exception as exc:  # noqa: BLE001 - red de seguridad global
        logger.exception("Error no controlado en %s %s", request.method, request.url.path)
        return JSONResponse(
            status_code=500,
            content={"detail": f"Error interno: {type(exc).__name__}: {str(exc)[:300]}"},
        )


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_exception_handler(AppError, app_error_handler)

app.include_router(api_router, prefix="/api/v1")


@app.get("/")
def root() -> dict[str, str]:
    return {"app": settings.APP_NAME, "status": "running"}
