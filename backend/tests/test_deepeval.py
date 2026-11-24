import pytest

from app.services.metrics import deepeval
from app.services.metrics.fact_level_judges import JudgeModelRef


def test_deepeval_judge_model_is_built_once_per_judge(monkeypatch: pytest.MonkeyPatch) -> None:
    built_for: list[str] = []

    def fake_build(judge: JudgeModelRef) -> str:
        built_for.append(judge.model_id())
        return built_for[-1]

    monkeypatch.setattr(deepeval, "_judge_models", {})
    monkeypatch.setattr(deepeval, "_build_deepeval_model", fake_build)
    first_judge = JudgeModelRef("openrouter", "qwen/qwen3.8-flash")
    second_judge = JudgeModelRef("openrouter", "z-ai/glm-5.3-flash")

    first = deepeval.get_deepeval_judge_model(first_judge)
    second = deepeval.get_deepeval_judge_model(second_judge)
    first_again = deepeval.get_deepeval_judge_model(first_judge)

    assert (first, second, first_again) == (
        "openrouter:qwen/qwen3.8-flash",
        "openrouter:z-ai/glm-5.3-flash",
        "openrouter:qwen/qwen3.8-flash",
    )
    assert built_for == ["openrouter:qwen/qwen3.8-flash", "openrouter:z-ai/glm-5.3-flash"]
