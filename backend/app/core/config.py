from pathlib import Path

from pydantic import SecretStr, model_validator
from pydantic_settings import (
    BaseSettings,
    PydanticBaseSettingsSource,
    SettingsConfigDict,
)

_BACKEND_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_BACKEND_ROOT / ".env",
        env_file_encoding="utf-8",
        # A validation error would otherwise echo the whole raw settings dict — including the
        # leading characters of API keys — into the traceback and on into Cloud Logging.
        hide_input_in_errors=True,
    )

    @classmethod
    def settings_customise_sources(
        cls,
        settings_cls: type[BaseSettings],
        init_settings: PydanticBaseSettingsSource,
        env_settings: PydanticBaseSettingsSource,
        dotenv_settings: PydanticBaseSettingsSource,
        file_secret_settings: PydanticBaseSettingsSource,
    ) -> tuple[PydanticBaseSettingsSource, ...]:
        # pydantic-settings defaults to env vars over .env, so an unrelated global export (e.g.
        # GEMINI_API_KEY set for another CLI tool in ~/.profile) silently shadows this project's
        # backend/.env with no error. Production sets no .env file, so this only ever changes
        # local dev, where the project's own .env is meant to be authoritative.
        return init_settings, dotenv_settings, env_settings, file_secret_settings

    app_name: str = "Piotr Konkol - Praca inżynierska - Podsumowania z użyciem LLM"
    git_sha: str = ""
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
    mongodb_uri: str = "mongodb://localhost:27017"
    mongodb_db_name: str = "web_summarization"
    mongodb_jobs_collection: str = "jobs"
    # "auto" asks the model to match the source content's own language instead of naming one.
    supported_summary_languages: list[str] = ["auto", "en", "pl"]
    supported_models: dict[str, list[str]] = {
        "gemini": [
            "gemini-flash-lite-latest",
            "gemini-flash-latest",
            "gemma-4-31b-it",
        ],
        "openrouter": [
            "openrouter/free",
            "openai/gpt-oss-20b:free",
            "nvidia/nemotron-3.5-lightning:free",
            "nvidia/nemotron-3-ultra-550b-a55b:free",
            "~deepseek/deepseek-v4-flash-latest",
            "deepseek/deepseek-v3.2",
            "~z-ai/glm-flash-latest",
        ],
    }
    # strategy -> human-readable label
    supported_processing_strategies: dict[str, str] = {
        "direct": "Bezpośredni — jeden prompt (ekstraktor + abstraktor)",
        "extract_then_synthesize": "Ekstrakcja i synteza — najpierw punkty, wynik wyprowadzony z punktów",
    }
    auth_enabled: bool = False
    auth_secret: SecretStr = SecretStr("")
    jwt_secret: SecretStr = SecretStr("")
    jwt_expire_hours: int = 168
    deepeval_judge_model: dict[str, str] = {
        "model_provider": "gemini",
        "model_name": "gemini-flash-latest",
    }
    title_model: dict[str, str] = {
        "model_provider": "gemini",
        "model_name": "gemini-flash-latest",
    }
    deepeval_timeout_seconds: int | None = None
    eval_max_concurrent_geval: int = 3
    blocking_work_max_threads: int = 5
    stale_work_timeout_minutes: int = 15
    max_resume_attempts: int = 3

    @model_validator(mode="after")
    def _require_secrets_when_auth_enabled(self) -> Settings:
        if self.auth_enabled and not (self.auth_secret and self.jwt_secret):
            raise ValueError("AUTH_ENABLED=true requires both AUTH_SECRET and JWT_SECRET")
        return self


settings = Settings()
