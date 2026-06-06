from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


_BACKEND_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_BACKEND_ROOT / ".env",
        env_file_encoding="utf-8",
    )

    app_name: str = "Praca Inżynierska - LLM Summary Service"
    gemini_api_key: str | None = None
    openrouter_api_key: str | None = None
    ollama_url: str = "http://localhost:11434"
    debug: bool = False
    # summary_base_output_tokens: int = 10000
    # summary_tokens_per_1000_chars: int = 120
    summary_max_output_tokens: int = 32000
    mongodb_uri: str = "mongodb://localhost:27017"
    mongodb_db_name: str = "web_summarization"
    mongodb_jobs_collection: str = "jobs"
    supported_models: dict[str, list[str]] = {
        "gemini": ["gemini-2.5-flash-lite", "gemini-2.5-pro", "gemini-3.5-flash"],
        "openrouter": ["gpt-4o-mini", "gpt-3.5o-mini"],
    }
    default_model: dict[str, str] = {
        "provider": "gemini",
        "model_name": "gemini-2.5-flash-lite",
    }


settings = Settings()
