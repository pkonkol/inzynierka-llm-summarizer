import pytest
from pydantic import ValidationError

from app.core.config import Settings


def test_a_thinking_model_outside_the_ollama_catalogue_refuses_to_start() -> None:
    with pytest.raises(ValidationError, match="OLLAMA_THINKING_MODELS"):
        Settings(
            supported_models={"gemini": ["gemini-3.8-flash"], "ollama": ["qwen3.8:27b"]},
            ollama_thinking_models=["qwen3.8-27b"],
        )


def test_a_thinking_model_from_the_ollama_catalogue_is_accepted() -> None:
    settings = Settings(
        supported_models={"gemini": ["gemini-3.8-flash"], "ollama": ["qwen3.8:27b"]},
        ollama_thinking_models=["qwen3.8:27b"],
    )

    assert settings.ollama_thinking_models == ["qwen3.8:27b"]
