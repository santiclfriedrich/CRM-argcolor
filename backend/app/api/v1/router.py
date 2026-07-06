"""Aggregates all v1 routers under a single APIRouter."""

from fastapi import APIRouter

from app.api.v1 import (
    auth,
    clientes,
    config,
    contactos,
    dominios,
    health,
    mails,
    notificaciones,
    oportunidades,
    solicitudes,
    usuarios,
)

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(usuarios.router)
api_router.include_router(clientes.router)
api_router.include_router(contactos.router)
api_router.include_router(dominios.router)
api_router.include_router(oportunidades.router)
api_router.include_router(solicitudes.router)
api_router.include_router(mails.router)
api_router.include_router(notificaciones.router)
api_router.include_router(config.router)
