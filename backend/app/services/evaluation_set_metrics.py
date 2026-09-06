from __future__ import annotations

import asyncio
from dataclasses import asdict
from typing import Any

from deepeval.test_case import LLMTestCase

from ..core.config import settings
from .metrics.deepeval import SUMMARY_INPUT_SPECS, SUMMARY_SPECS, evaluate_geval
from .metrics.statistical import source_metrics, summary_metrics


async def build_golden_metrics(input_text: str, golden_summary: str) -> dict[str, Any]:
    def statistical() -> dict[str, Any]:
        return {
            "source": source_metrics(input_text),
            "summary": summary_metrics(golden_summary, input_text),
        }

    work = [
        *((spec, LLMTestCase(input="", actual_output=golden_summary)) for spec in SUMMARY_SPECS),
        *(
            (spec, LLMTestCase(input=input_text, actual_output=golden_summary))
            for spec in SUMMARY_INPUT_SPECS
        ),
    ]
    judged, stats = await asyncio.gather(
        evaluate_geval(settings, work),
        asyncio.to_thread(statistical),
    )

    return {**stats, "deepeval": [asdict(x) for x in judged]}
