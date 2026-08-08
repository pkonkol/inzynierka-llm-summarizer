from __future__ import annotations

from dataclasses import asdict
from typing import Any

from app.core.config import settings
from app.services.metrics.deepeval import (
    evaluate_summary_input_metrics,
    evaluate_summary_metrics,
)
from app.services.metrics.deterministic import summary_metrics


async def build_golden_metrics(input_text: str, golden_summary: str) -> dict[str, Any]:
    summary_results = await evaluate_summary_metrics(settings, golden_summary)
    summary_input_results = await evaluate_summary_input_metrics(
        settings=settings,
        article_text=input_text,
        summary=golden_summary,
    )

    return {
        "summary": summary_metrics(golden_summary, input_text),
        "deepeval": [asdict(x) for x in (*summary_results, *summary_input_results)],
    }