"""AI provider factory: selects implementation based on AI_PROVIDER env var."""

from functools import lru_cache

from app.config import settings
from app.integrations.ai.base import AIProvider
from app.integrations.ai.gemini import GeminiProvider


@lru_cache
def get_ai_provider() -> AIProvider:
    """Return the configured AI provider singleton."""
    provider = settings.AI_PROVIDER.lower()
    if provider == "gemini":
        return GeminiProvider()
    # Futuro: "claude" -> ClaudeProvider(), "ollama" -> OllamaProvider()
    raise ValueError(f"AI_PROVIDER no soportado: {settings.AI_PROVIDER}")
