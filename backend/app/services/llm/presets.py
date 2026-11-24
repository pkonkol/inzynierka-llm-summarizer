# services/llm/presets.py — the summary kinds offered on the public page

from pydantic import BaseModel

from ...schemas.summary_spec import ScaledLength, SummarySpec


class SummaryPreset(BaseModel):
    label: str
    description: str  # one plain-language sentence for a visitor who knows no summarization terms
    spec: SummarySpec


# Every preset scales with the visitor's length slider, which overrides only `slider`; the other
# ScaledLength fields travel with the preset. Dict order is the display order.
SUMMARY_PRESETS: dict[str, SummaryPreset] = {
    "facts": SummaryPreset(
        label="Fakty i wnioski",
        description="Podaje konkretne fakty i wnioski z artykułu, więc można go nie czytać.",
        spec=SummarySpec(length=ScaledLength(slider=0.5)),
    ),
    "key_points": SummaryPreset(
        label="Kluczowe punkty",
        description="Najważniejsze fakty z artykułu w formie listy punktów.",
        spec=SummarySpec(output_format="bullets", length=ScaledLength(slider=0.5)),
    ),
    "topics": SummaryPreset(
        label="O czym jest tekst",
        description="Wymienia tylko tematy, które artykuł porusza, bez faktów i wniosków. Pomaga zdecydować, czy warto czytać.",
        spec=SummarySpec(
            narrative_stance="about_document",
            summary_function="indicative",
            length=ScaledLength(slider=0.5),
        ),
    ),
    "one_sentence": SummaryPreset(
        label="Jedno zdanie",
        description="Sedno artykułu w jednym zdaniu, z najważniejszym faktem.",
        spec=SummarySpec(length=ScaledLength(slider=0.5, max_sentences=1, words_multiplier=0.2)),
    ),
}
