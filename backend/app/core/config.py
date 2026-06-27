from pathlib import Path

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


_BACKEND_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_BACKEND_ROOT / ".env",
        env_file_encoding="utf-8",
    )

    app_name: str = "Piotr Konkol - Praca inżynierska - Podsumowania z użyciem LLM"
    gemini_api_key: SecretStr | None = None
    openrouter_api_key: SecretStr | None = None
    ollama_url: str = ""
    debug: bool = False
    summary_max_output_tokens: int = 32000
    mongodb_uri: str = "mongodb://localhost:27017"
    mongodb_db_name: str = "web_summarization"
    mongodb_jobs_collection: str = "jobs"
    supported_summary_languages: list[str] = ["en", "pl"]
    supported_models: dict[str, list[str]] = {
        "gemini": ["gemini-2.5-flash-lite", "gemini-2.5-pro", "gemini-3.5-flash"],
        "openrouter": ["openai/gpt-oss-120b:free", "openai/gpt-oss-20b:free", "google/gemma-4-31b-it:free"],
        "ollama": ["gemma4:31b-cloud"],
    }
    # mode -> human-readable label
    supported_summary_modes: dict[str, str] = {
        "simple":     "Simple — single prompt (extractor + abstractor)",
        "sequential": "Sequential — two independent prompts (takeaways first, then summary)",
        "cascade":    "Cascade — takeaways first, summary derived from takeaways",
    }
    default_model: dict[str, str] = {
        "model_provider": "gemini",
        "model_name": "gemini-2.5-flash-lite",
    }
    auth_secret: str = ""
    jwt_secret: str = ""
    jwt_expire_hours: int = 168


settings = Settings()
