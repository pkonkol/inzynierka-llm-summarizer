# services/llm/presets.py — named SummarySpec bundles served to the frontend

from pydantic import BaseModel

from ...schemas.summary_spec import ExplicitLength, SummarySpec


class SummaryPreset(BaseModel):
    label: str
    spec: SummarySpec


SUMMARY_PRESETS: dict[str, SummaryPreset] = {
    "standard": SummaryPreset(
        label="Standardowy",
        spec=SummarySpec(length=ExplicitLength(target_words=120, target_sentences=6)),
    ),
    "news_highlights": SummaryPreset(
        label="Newsowe podsumowanie",
        spec=SummarySpec(length=ExplicitLength(target_words=35, target_sentences=3)),
    ),
    "journalistic_abstract": SummaryPreset(
        label="Abstrakt dziennikarski",
        spec=SummarySpec(length=ExplicitLength(target_words=85, target_sentences=4)),
    ),
    "indicative_one_sentence": SummaryPreset(
        label="Wskazujące, jedno zdanie",
        spec=SummarySpec(
            narrative_stance="about_document",
            summary_function="indicative",
            length=ExplicitLength(target_words=45, target_sentences=1),
        ),
    ),
}
