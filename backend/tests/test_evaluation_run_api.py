"""Case cs25: which run settings the API accepts."""

import pytest
from pydantic import ValidationError

from app.schemas.evaluation_run_api import EvaluationRunCreateRequest


def test_case_25_extract_then_synthesize_rejects_context_expansion() -> None:
    with pytest.raises(ValidationError, match="context_expansion_mode"):
        EvaluationRunCreateRequest.model_validate(
            {
                "model_provider": "gemini",
                "model_name": "gemini-3.8-flash",
                "processing_strategy": "extract_then_synthesize",
                "context_expansion_mode": "staged",
            }
        )


def test_case_25b_direct_accepts_context_expansion() -> None:
    request = EvaluationRunCreateRequest.model_validate(
        {
            "model_provider": "gemini",
            "model_name": "gemini-3.8-flash",
            "processing_strategy": "direct",
            "context_expansion_mode": "staged",
        }
    )

    assert request.context_expansion_mode == "staged"
