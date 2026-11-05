from __future__ import annotations

from ...schemas.judges import CoherenceJudgement, CoherenceResult
from .fact_level_judges import JudgeModelRef, ask_judge
from .judge_prompts import COHERENCE_PROMPT, judge_prompt_version, prompt_wording

COHERENCE_PROMPT_VERSION = judge_prompt_version(prompt_wording(COHERENCE_PROMPT))


async def judge_coherence(summary: str, judge: JudgeModelRef) -> CoherenceResult:
    """Pass/Fail on the summary alone: does it read as one connected text."""
    judgement, usage = await ask_judge(
        COHERENCE_PROMPT,
        CoherenceJudgement,
        {"summary": summary.replace("</summary", "&lt;/summary")},
        judge,
        "coherence",
    )
    return CoherenceResult(
        judgement=judgement,
        judge_model=judge.model_id(),
        prompt_version=COHERENCE_PROMPT_VERSION,
        usage=usage,
    )
