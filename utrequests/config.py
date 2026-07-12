from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

# Editions known to publish to the public songbooks bucket; used as a fallback
# when the bucket listing is unavailable.
KNOWN_EDITIONS = [
    "current",
    "complete",
    "monopolele-2026",
    "pride-2026",
    "travel-songbook",
    "ukulele-hooley-2025",
    "wexford-2026",
    "womens-2026",
]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    gemini_api_key: str | None = None
    gemini_model: str = "gemini-2.5-flash"
    bucket_base_url: str = "https://storage.googleapis.com/ukulele-tuesday-songbooks"
    catalogue_cache_ttl: float = 900.0
    max_image_edge: int = 1600
    default_edition: str = "current"


@lru_cache
def get_settings() -> Settings:
    return Settings()
