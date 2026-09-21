import pytest
from pydantic import ValidationError

from app.schemas.job_api import MANUAL_SOURCE_PREFIX, JobCreateRequest


def _request(**source: str) -> JobCreateRequest:
    return JobCreateRequest(model_provider="gemini", model_name="gemini-flash-latest", **source)


def test_a_pasted_text_is_keyed_by_its_first_sentence() -> None:
    request = _request(input_text="Lehman Brothers collapsed.  It was 2008.\nMarkets fell.")

    source_url, text = request.source_url_and_text()

    assert source_url == f"{MANUAL_SOURCE_PREFIX}Lehman Brothers collapsed."
    assert text.startswith("Lehman")


def test_the_same_text_always_gets_the_same_key() -> None:
    first, _ = _request(input_text="Same opening. Rest one.").source_url_and_text()
    second, _ = _request(input_text="Same opening.   Different rest.").source_url_and_text()

    assert first == second


def test_a_text_without_sentence_punctuation_is_truncated_for_the_key() -> None:
    source_url, _ = _request(input_text="word " * 200).source_url_and_text()

    assert len(source_url.removeprefix(MANUAL_SOURCE_PREFIX)) == 200


def test_a_url_job_starts_with_no_text() -> None:
    assert _request(url="https://example.com/a").source_url_and_text() == (
        "https://example.com/a",
        "",
    )


@pytest.mark.parametrize(
    "source",
    [
        {},
        {"input_text": "   \n "},
        {"url": "https://example.com/a", "input_text": "text"},
    ],
)
def test_exactly_one_non_blank_source_is_required(source: dict[str, str]) -> None:
    with pytest.raises(ValidationError):
        _request(**source)
