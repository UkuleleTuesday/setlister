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

    gemini_model: str = "gemini-2.5-flash"
    # Gemini runs through Vertex AI over Application Default Credentials — no API
    # key, matching ../tabby and songbook-generator. Authenticate locally with
    # `gcloud auth application-default login`.
    gcp_project: str = "songbook-generator"
    gcp_location: str = "us-central1"
    bucket_base_url: str = "https://storage.googleapis.com/ukulele-tuesday-songbooks"
    catalogue_cache_ttl: float = 900.0
    max_image_edge: int = 1600
    default_edition: str = "current"
    # Origins allowed to call the API cross-origin (the GitHub Pages UI, plus
    # localhost for serving ui/ during development).
    cors_allowed_origins: list[str] = [
        "https://ukuleletuesday.github.io",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]
    max_upload_bytes: int = 20_000_000
    # Per-IP budget for POST /api/parse (each call invokes a paid Gemini model).
    parse_rate_limit: int = 8
    parse_rate_window_seconds: int = 60


@lru_cache
def get_settings() -> Settings:
    return Settings()
