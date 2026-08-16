from pathlib import Path

from pydantic import SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_BACKEND_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_BACKEND_ROOT / ".env",
        env_file_encoding="utf-8",
        # A validation error would otherwise echo the whole raw settings dict — including the
        # leading characters of API keys — into the traceback and on into Cloud Logging.
        hide_input_in_errors=True,
    )

    app_name: str = "Piotr Konkol - Praca inżynierska - Podsumowania z użyciem LLM"
    gemini_api_key: SecretStr | None = None
    openrouter_api_key: SecretStr | None = None
    ollama_url: str = ""
    debug: bool = False
    # "pretty" — colored human-readable output for local dev.
    # "json" — one JSON object per line with a `severity` field, parsed by GCP Cloud Logging.
    log_format: str = "pretty"
    # If set, logs are additionally written here (plain text, no ANSI colors) alongside stdout.
    log_file: str = ""
    # Browser origins allowed to call this API. Defaults to the Vite dev server; production
    # origins (Firebase Hosting) are injected as JSON via the CORS_ALLOWED_ORIGINS env var.
    cors_allowed_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    summary_max_output_tokens: int = 32000
    mongodb_uri: str = "mongodb://localhost:27017"
    mongodb_db_name: str = "web_summarization"
    mongodb_jobs_collection: str = "jobs"
    supported_summary_languages: list[str] = ["en", "pl"]
    supported_models: dict[str, list[str]] = {
        "gemini": ["gemini-2.5-flash-lite", "gemini-2.5-pro", "gemini-3.5-flash"],
        "openrouter": [
            "openai/gpt-oss-20b:free",
            "google/gemma-4-31b-it:free",
        ],
        "ollama": ["gemma4:31b-cloud"],
    }
    # mode -> human-readable label
    supported_summary_modes: dict[str, str] = {
        "simple": "Simple — single prompt (extractor + abstractor)",
        "sequential": "Sequential — two independent prompts (takeaways first, then summary)",
        "cascade": "Cascade — takeaways first, summary derived from takeaways",
    }
    default_model: dict[str, str] = {
        "model_provider": "gemini",
        "model_name": "gemini-2.5-flash-lite",
    }
    auth_enabled: bool = False
    auth_secret: SecretStr = SecretStr("")
    jwt_secret: SecretStr = SecretStr("")
    jwt_expire_hours: int = 168
    deepeval_judge_model: dict[str, str] = {
        "model_provider": "gemini",
        "model_name": "gemini-flash-latest",
    }
    deepeval_timeout_seconds: int | None = None

    @model_validator(mode="after")
    def _require_secrets_when_auth_enabled(self) -> Settings:
        if self.auth_enabled and not (self.auth_secret and self.jwt_secret):
            raise ValueError("AUTH_ENABLED=true requires both AUTH_SECRET and JWT_SECRET")
        return self


settings = Settings()
