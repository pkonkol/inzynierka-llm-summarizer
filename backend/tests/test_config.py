import pytest
from pydantic import ValidationError

from app.core.config import Settings

DEEPSEEK = "deepseek/deepseek-v4.1-flash-1017:nitro"


def test_a_thinking_model_outside_the_ollama_catalogue_refuses_to_start() -> None:
    with pytest.raises(ValidationError, match="OLLAMA_THINKING_MODELS"):
        Settings(
            supported_models={
                "gemini": ["gemini-3.8-flash"],
                "ollama": ["qwen3.8:27b"],
                "openrouter": [DEEPSEEK],
            },
            ollama_thinking_models=["qwen3.8-27b"],
        )


def test_a_thinking_model_from_the_ollama_catalogue_is_accepted() -> None:
    settings = Settings(
        supported_models={
            "gemini": ["gemini-3.8-flash"],
            "ollama": ["qwen3.8:27b"],
            "openrouter": [DEEPSEEK],
        },
        ollama_thinking_models=["qwen3.8:27b"],
    )

    assert settings.ollama_thinking_models == ["qwen3.8:27b"]


def test_a_non_reasoning_model_outside_the_openrouter_catalogue_refuses_to_start() -> None:
    with pytest.raises(ValidationError, match="openrouter_non_reasoning_models") as refusal:
        Settings(
            supported_models={
                "gemini": ["gemini-3.8-flash"],
                "openrouter": [DEEPSEEK, "vendor/model-a"],
            },
            openrouter_non_reasoning_models=["vendor/model-b"],
        )

    assert "extra_forbidden" not in str(
        refusal.value
    )  # the field exists; the catalogue check refuses


def test_a_non_reasoning_model_from_the_openrouter_catalogue_is_accepted() -> None:
    settings = Settings(
        supported_models={
            "gemini": ["gemini-3.8-flash"],
            "openrouter": [DEEPSEEK, "vendor/model-a"],
        },
        openrouter_non_reasoning_models=["vendor/model-a"],
    )

    assert settings.openrouter_non_reasoning_models == ["vendor/model-a"]


def test_the_default_public_and_title_model_is_the_non_reasoning_deepseek() -> None:
    settings = Settings()
    deepseek = "deepseek/deepseek-v4.1-flash-1017:nitro"

    assert deepseek in settings.supported_models["openrouter"]
    assert settings.openrouter_non_reasoning_models == [deepseek]
    expected = {"model_provider": "openrouter", "model_name": deepseek}
    assert settings.public_summary_model == expected
    assert settings.title_model == expected


def test_the_default_gemini_catalogue_offers_gemini_4_hydrogen() -> None:
    assert "gemini-4-hydrogen" in Settings().supported_models["gemini"]
