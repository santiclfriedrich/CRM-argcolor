"""Application-level exceptions and FastAPI handlers."""

from fastapi import Request
from fastapi.responses import JSONResponse


class AppError(Exception):
    """Base class for handled application errors."""

    def __init__(self, message: str, status_code: int = 400) -> None:
        self.message = message
        self.status_code = status_code
        super().__init__(message)


class NotFoundError(AppError):
    def __init__(self, message: str = "Recurso no encontrado") -> None:
        super().__init__(message, status_code=404)


async def app_error_handler(_: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.message})
