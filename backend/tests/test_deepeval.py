import pytest

from app.core.config import Settings
from app.services.metrics import deepeval


def test_deepeval_judge_model_follows_a_changed_setting(monkeypatch: pytest.MonkeyPatch) -> None:
    built_for: list[str] = []

    def fake_build(settings: Settings) -> str:
        built_for.append(deepeval.judge_model_id(settings))
        return built_for[-1]

    monkeypatch.setattr(deepeval, "_judge_models", {})
    monkeypatch.setattr(deepeval, "_build_deepeval_model", fake_build)
    first_judge = {"model_provider": "openrouter", "model_name": "qwen/qwen3.8-flash"}
    second_judge = {"model_provider": "openrouter", "model_name": "z-ai/glm-5.3-flash"}

    first = deepeval.get_deepeval_judge_model(Settings(deepeval_judge_model=first_judge))
    second = deepeval.get_deepeval_judge_model(Settings(deepeval_judge_model=second_judge))
    first_again = deepeval.get_deepeval_judge_model(Settings(deepeval_judge_model=first_judge))

    assert (first, second, first_again) == (
        "openrouter:qwen/qwen3.8-flash",
        "openrouter:z-ai/glm-5.3-flash",
        "openrouter:qwen/qwen3.8-flash",
    )
    assert built_for == ["openrouter:qwen/qwen3.8-flash", "openrouter:z-ai/glm-5.3-flash"]
