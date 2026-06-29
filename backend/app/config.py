"""Application configuration loaded from environment variables."""

from functools import lru_cache

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
    GMAIL_QUERY: str = "newer_than:1d"  # filtro Gmail; dedup evita reprocesar
    GMAIL_POLL_INTERVAL_SECONDS: int = 120

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
