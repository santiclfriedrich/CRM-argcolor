"""Application configuration loaded from environment variables."""

from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Central settings. All secrets come from environment variables / .env."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    # --- App ---
    APP_NAME: str = "CRM Comercial ARG COLOR"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True

    # --- Database ---
    DATABASE_URL: str = (
        "postgresql+psycopg://postgres:postgres@localhost:5432/argcolor"
    )

    @field_validator("DATABASE_URL")
    @classmethod
    def _forzar_driver_psycopg(cls, v: str) -> str:
        """Acepta la URL que dé cualquier proveedor (postgres:// o postgresql://)
        y la normaliza al driver psycopg que usa la app."""
        if v.startswith("postgres://"):
            v = "postgresql://" + v[len("postgres://") :]
        if v.startswith("postgresql://"):
            v = "postgresql+psycopg://" + v[len("postgresql://") :]
        return v

    # --- Security / Auth ---
    SECRET_KEY: str = "change-me"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 1 día
    ALGORITHM: str = "HS256"

    # --- Google OAuth ---
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""

    # --- IA ---
    AI_PROVIDER: str = "gemini"
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.5-flash"

    # --- Gmail / Pub-Sub ---
    GMAIL_TOPIC_NAME: str = ""

    # --- Gmail polling (Camino A: OAuth refresh token de la casilla comercial) ---
    GMAIL_ENABLED: bool = False  # activar solo cuando estén las credenciales cargadas
    GMAIL_USER: str = "me"  # casilla a leer (ej. ventas@argentinacolor.com)
    GMAIL_CLIENT_ID: str = ""
    GMAIL_CLIENT_SECRET: str = ""
    GMAIL_REFRESH_TOKEN: str = ""
    # Ventana temporal base de la búsqueda. La query final se arma sumando los
    # dominios de clientes cargados + la etiqueta comodín (ver build_poll_query).
    GMAIL_QUERY: str = "newer_than:2d"
    # Etiqueta comodín para prospectos nuevos cuyo dominio aún no está cargado.
    GMAIL_LABEL: str = "crm"
    # Cada corrida abre una sesión de DB y hace varias queries; 5 min es de sobra
    # para la bandeja y baja bastante el tráfico contra Neon respecto a 2 min.
    GMAIL_POLL_INTERVAL_SECONDS: int = 300
    # Camino B: ruta al JSON de la service account (con domain-wide delegation).
    # Si está seteado, se leen las casillas de todos los usuarios (impersonación).
    GMAIL_SERVICE_ACCOUNT_FILE: str = ""

    # --- Almacenamiento de archivos (adjuntos y PDFs) ---
    # "local" (dev, disco MEDIA_DIR) | "r2" (prod, Cloudflare R2 / S3).
    STORAGE_BACKEND: str = "local"
    MEDIA_DIR: str = "media"
    R2_ENDPOINT_URL: str = ""  # https://<accountid>.r2.cloudflarestorage.com
    R2_ACCESS_KEY_ID: str = ""
    R2_SECRET_ACCESS_KEY: str = ""
    R2_BUCKET: str = ""

    # --- Datos de la empresa (encabezado de los PDF de presupuesto) ---
    EMPRESA_NOMBRE: str = "ARG COLOR S.R.L."
    EMPRESA_CUIT: str = ""
    EMPRESA_DIRECCION: str = ""
    EMPRESA_TELEFONO: str = ""
    EMPRESA_EMAIL: str = "ventas@argentinacolor.com"

    # --- ERP GBP (GlobalBluePoint): sync one-way de clientes ERP -> CRM ---
    # SOAP 1.1 sobre HTTPS. Credenciales SOLO por env var (nunca en el código).
    GBP_WS_URL: str = (
        "https://ws.globalbluepoint.com.ar/arg/app_webservices/wsBasicQuery.asmx"
    )
    GBP_NAMESPACE: str = "http://microsoft.com/webservices/"
    GBP_USER: str = ""
    GBP_PWD: str = ""
    GBP_COMPANY: str = "1"  # ARG COLOR S.R.L.
    GBP_WS: str = ""  # ID del Web Service (ej. 1011)
    GBP_VERIFY_SSL: bool = False  # el server usa certificado propio
    # Páginas de clientes que se bajan en paralelo (acorta el fetch, que es lento
    # por la latencia del ERP). Subir con cuidado para no saturar GBP.
    GBP_FETCH_CONCURRENCY: int = 8
    # Token secreto para disparar la sync desde un endpoint (corre en el server).
    # Si queda vacío, el endpoint está deshabilitado.
    GBP_SYNC_TOKEN: str = ""
    # Solo se sincronizan estos tipos de cliente (ck_id) -> "Clase de cliente".
    # Mapa en app/services/gbp_sync.py (CK_ID_A_CLASE).

    # --- Ingesta de bandeja ---
    # Remitentes (dominios o direcciones) cuyas notificaciones automáticas NO
    # deben crear oportunidad. Coma-separado; editable por env sin tocar código.
    # Ej: "medox.ai,noreply@otraplataforma.com".
    INGEST_SENDER_DENYLIST: str = "medox.ai"

    @property
    def ingest_sender_denylist(self) -> list[str]:
        return [s.strip().lower() for s in self.INGEST_SENDER_DENYLIST.split(",") if s.strip()]

    # Dominios PROPIOS de la empresa: nunca se registran como dominio de cliente
    # ni se usan para matchear (un mail interno NO es un cliente).
    COMPANY_EMAIL_DOMAINS: str = "argentinacolor.com,argentinacolor.com.ar"

    @property
    def company_email_domains(self) -> list[str]:
        return [d.strip().lower() for d in self.COMPANY_EMAIL_DOMAINS.split(",") if d.strip()]

    # URL pública del backend (para el pixel de seguimiento de mails). En Railway
    # va el dominio del backend; vacío en dev => el tracking queda desactivado.
    PUBLIC_BASE_URL: str = ""

    # --- CORS ---
    ALLOWED_ORIGINS: str = "http://localhost:3000"

    @property
    def allowed_origins_list(self) -> list[str]:
        """ALLOWED_ORIGINS as a list (comma-separated in the env var)."""
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    """Cached settings singleton."""
    return Settings()


settings = get_settings()
