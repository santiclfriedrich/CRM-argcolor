"""Almacenamiento de archivos (adjuntos y PDFs).

Se guarda por *key* (ruta relativa, ej. ``oportunidades/5/1_plano.pdf``). El
backend concreto lo define ``STORAGE_BACKEND``:
- ``local`` (dev): carpeta ``MEDIA_DIR`` en disco.
- ``r2`` (prod): Cloudflare R2 / S3 vía boto3 (durable, sin backups manuales).

Los callers guardan/leen/borran por key; nunca manejan rutas absolutas.
"""

from __future__ import annotations

from pathlib import Path

from app.config import settings


class Storage:
    """Interfaz mínima de almacenamiento por key."""

    def put(self, key: str, data: bytes, content_type: str | None = None) -> str:
        raise NotImplementedError

    def get(self, key: str) -> bytes:
        """Devuelve los bytes. Lanza FileNotFoundError si no existe."""
        raise NotImplementedError

    def delete(self, key: str) -> None:
        raise NotImplementedError

    def exists(self, key: str) -> bool:
        raise NotImplementedError


class LocalStorage(Storage):
    """Archivos en disco bajo MEDIA_DIR (desarrollo)."""

    def __init__(self, base: str) -> None:
        self._base = Path(base)

    def _ruta(self, key: str) -> Path:
        # Compat: si viniera una ruta absoluta vieja, se usa tal cual.
        p = Path(key)
        return p if p.is_absolute() else self._base / key

    def put(self, key: str, data: bytes, content_type: str | None = None) -> str:
        ruta = self._ruta(key)
        ruta.parent.mkdir(parents=True, exist_ok=True)
        ruta.write_bytes(data)
        return key

    def get(self, key: str) -> bytes:
        return self._ruta(key).read_bytes()  # FileNotFoundError si no existe

    def delete(self, key: str) -> None:
        self._ruta(key).unlink(missing_ok=True)

    def exists(self, key: str) -> bool:
        return self._ruta(key).is_file()


class R2Storage(Storage):
    """Cloudflare R2 (API S3) vía boto3."""

    def __init__(self) -> None:
        import boto3

        self._bucket = settings.R2_BUCKET
        self._client = boto3.client(
            "s3",
            endpoint_url=settings.R2_ENDPOINT_URL,
            aws_access_key_id=settings.R2_ACCESS_KEY_ID,
            aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
            region_name="auto",
        )

    def put(self, key: str, data: bytes, content_type: str | None = None) -> str:
        extra = {"ContentType": content_type} if content_type else {}
        self._client.put_object(Bucket=self._bucket, Key=key, Body=data, **extra)
        return key

    def get(self, key: str) -> bytes:
        from botocore.exceptions import ClientError

        try:
            obj = self._client.get_object(Bucket=self._bucket, Key=key)
        except ClientError as exc:
            raise FileNotFoundError(key) from exc
        return obj["Body"].read()

    def delete(self, key: str) -> None:
        self._client.delete_object(Bucket=self._bucket, Key=key)

    def exists(self, key: str) -> bool:
        from botocore.exceptions import ClientError

        try:
            self._client.head_object(Bucket=self._bucket, Key=key)
        except ClientError:
            return False
        return True


_r2_storage: R2Storage | None = None


def get_storage() -> Storage:
    # R2: cliente pesado -> lo cacheamos. Local: barato y así respeta cambios de
    # MEDIA_DIR (útil en tests que lo parchean).
    if settings.STORAGE_BACKEND == "r2":
        global _r2_storage
        if _r2_storage is None:
            _r2_storage = R2Storage()
        return _r2_storage
    return LocalStorage(settings.MEDIA_DIR)
