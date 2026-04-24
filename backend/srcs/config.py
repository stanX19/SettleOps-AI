"""
Environment configuration for backend.
"""
import os.path
from functools import lru_cache
from pathlib import Path

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
    GEMINI_API_KEY_LIST: list[str] = []
    GEMINI_MODEL_NAME: str = "gemini-2.0-flash"

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

    model_config = SettingsConfigDict(
        env_file=f"{ROOT}/.env",
        env_file_encoding="utf-8",
        extra="allow"  # Allow extra fields from .env without explicit definition
    )

@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()