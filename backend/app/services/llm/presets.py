# services/llm/presets.py — named SummarySpec bundles served to the frontend

from pydantic import BaseModel

from ...schemas.summary_spec import ExplicitLength, ScaledLength, SummarySpec


class SummaryPreset(BaseModel):
    label: str
    description: str  # one plain-language sentence for a visitor who knows no summarization terms
    spec: SummarySpec


# Dict order is the display order: JSON objects keep it on the way to the frontend.
SUMMARY_PRESETS: dict[str, SummaryPreset] = {
    "standard": SummaryPreset(
        label="Standardowy",
        description="Zwięzłe podsumowanie z najważniejszymi faktami, napisane tak, jakby mówił je sam tekst.",
        spec=SummarySpec(length=ScaledLength(slider=0.5)),
    ),
    "news_highlights": SummaryPreset(
        label="Newsowe podsumowanie",
        description="Kilka krótkich zdań z najważniejszymi informacjami, jak w serwisie informacyjnym.",
        spec=SummarySpec(length=ExplicitLength(target_words=35, target_sentences=3)),
    ),
    "journalistic_abstract": SummaryPreset(
        label="Abstrakt dziennikarski",
        description="Krótki akapit, który wystarcza, żeby nie czytać całego tekstu.",
        spec=SummarySpec(length=ExplicitLength(target_words=85, target_sentences=4)),
    ),
    "indicative_one_sentence": SummaryPreset(
        label="Jedno zdanie o czym jest tekst",
        description="Jedno zdanie o tym, czego dotyczy tekst, bez szczegółów. Pomaga zdecydować, czy warto czytać.",
        spec=SummarySpec(
            narrative_stance="about_document",
            summary_function="indicative",
            length=ExplicitLength(target_words=45, target_sentences=1),
        ),
    ),
}
