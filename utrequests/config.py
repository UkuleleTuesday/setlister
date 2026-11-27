from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

# Fallback when the bucket listing is unavailable.
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

    gemini_model: str = "gemini-2.5-flash"
    # Off: for temperature=0 extraction, thinking mostly adds latency.
    gemini_thinking_budget: int = 0
    # Vertex AI over Application Default Credentials, no API key. Locally:
    # `gcloud auth application-default login`.
    gcp_project: str = "songbook-generator"
    gcp_location: str = "us-central1"
    bucket_base_url: str = "https://storage.googleapis.com/ukulele-tuesday-songbooks"
    catalogue_cache_ttl: float = 900.0
    max_image_edge: int = 1600
    # Helps read ambiguous handwriting, at the cost of input tokens.
    catalogue_in_prompt: bool = True
    default_edition: str = "current"
    cors_allowed_origins: list[str] = [
        "https://setlister.ukuleletuesday.ie",
        # The old Pages origin: open tabs and cached copies still call from it.
        "https://ukuleletuesday.github.io",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]
    max_upload_bytes: int = 20_000_000
    # Per IP: each parse is a paid Gemini call.
    parse_rate_limit: int = 8
    parse_rate_window_seconds: int = 60


@lru_cache
def get_settings() -> Settings:
    return Settings()
