from __future__ import annotations

from ...schemas.judges import CoherenceJudgement
from .fact_level_judges import JudgeModelRef


async def judge_coherence(summary: str, judge: JudgeModelRef) -> CoherenceJudgement:
    """Pass/Fail on the summary alone: does it read as one connected text."""
    raise NotImplementedError
