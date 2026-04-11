from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


_BACKEND_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_BACKEND_ROOT / ".env",
        env_file_encoding="utf-8",
    )

    app_name: str = "Web Summarization Backend"
    gemini_model: str = "gemini-flash-lite-latest"
    gemini_api_key: str | None = None
    google_api_key: str | None = None
    debug: bool = False
    summary_base_output_tokens: int = 300
    summary_tokens_per_1000_chars: int = 120
    summary_max_output_tokens: int = 1600
    mongodb_uri: str = "mongodb://localhost:27017"
    mongodb_db_name: str = "web_summarization"
    mongodb_jobs_collection: str = "jobs"


settings = Settings()
