"""
Environment configuration for backend.
"""
import os.path
from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    ROOT: str = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    UPLOAD_DIR: str = os.path.join(ROOT, "uploads")
    REPORTS_DIR: str = os.path.join(ROOT, "generated", "reports")
    
    # Ilmu Configuration (OpenAI-compatible)
    ILMU_API_KEY: str = ""
    ILMU_BASE_URL: str = "https://api.ilmu.ai/v1"
    ILMU_MODEL_NAME: str = "ilmu-glm-5.1"
    
    # Gemini Configuration
    GEMINI_API_KEY: str = ""
    GEMINI_API_KEY_LIST: list[str] = []
    GEMINI_MODEL_NAME: str = "gemini-2.5-flash"
    GEMINI_VISION_TIMEOUT_SECONDS: float = 15.0
    GEMINI_VISION_BATCH_SIZE: int = 4
    GEMINI_VISION_MAX_KEYS: int = 12

    # ElevenLabs (Speech) Configuration
    ELEVENLABS_API_KEY: str = ""
    ELEVENLABS_MODEL: str = "eleven_multilingual_v2"
    ELEVENLABS_DEFAULT_VOICE_ID: str = "PoHUWWWMHFrA8z7Q88pu"

    # Cantonese AI
    CANTONESE_API_KEY: str = ""

    # Exa (Web Search) Configuration
    EXA_API_KEY: str = ""

    # Firebase Configuration
    FIREBASE_CREDENTIALS_JSON_PATH: str = "firebase_key.json"

    # Database Configuration
    USE_IN_MEMORY_DB: bool = False
    DB_NAME: str = "database.db"

    # Application Settings
    DEBUG: bool = False
    PORT: int = 8000
    LLM_LOCALHOST: bool = False
    LLM_LOCALHOST_URL: str = "http://127.0.0.1:1234/v1"
    USE_LLM_CACHE: bool = True

    @field_validator("DEBUG", mode="before")
    @classmethod
    def _parse_debug(cls, value):
        """Accept deployment labels like DEBUG=release as non-debug mode."""
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in {
                "release", "prod", "production", "false", "0", "no", "off", "",
            }:
                return False
            if normalized in {
                "debug", "dev", "development", "true", "1", "yes", "on",
            }:
                return True
        return value

    model_config = SettingsConfigDict(
        env_file=f"{ROOT}/.env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
