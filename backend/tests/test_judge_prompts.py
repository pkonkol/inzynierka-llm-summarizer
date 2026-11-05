"""Case cs32: the prompt version stored on every judge result."""

from app.services.metrics.judge_prompts import judge_prompt_version


def test_case_32_prompt_version_follows_the_exact_text() -> None:
    prompt = "Is every sentence supported by the source?"

    assert judge_prompt_version(prompt) == judge_prompt_version(prompt)
    assert judge_prompt_version(prompt) != judge_prompt_version(prompt + " ")
    assert len(judge_prompt_version(prompt)) == 8
    int(judge_prompt_version(prompt), 16)
