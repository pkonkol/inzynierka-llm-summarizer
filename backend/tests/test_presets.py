from app.schemas.summary_spec import ScaledLength
from app.services.llm.presets import SUMMARY_PRESETS


def test_every_preset_explains_itself_with_a_description_and_an_example() -> None:
    for key, preset in SUMMARY_PRESETS.items():
        assert preset.label.strip(), key
        assert preset.description.strip(), key
        assert preset.example.strip(), key


def test_every_preset_scales_with_the_slider() -> None:
    # The public page overrides only the slider, which is meaningless for any other policy.
    for key, preset in SUMMARY_PRESETS.items():
        assert isinstance(preset.spec.length, ScaledLength), key


def test_the_one_sentence_preset_keeps_a_single_sentence_at_every_slider_position() -> None:
    length = SUMMARY_PRESETS["one_sentence"].spec.length

    assert isinstance(length, ScaledLength)
    assert length.max_sentences == 1


def test_the_kinds_appear_in_the_order_the_page_lists_them() -> None:
    assert list(SUMMARY_PRESETS) == ["facts", "key_points", "topics", "one_sentence"]


def test_the_key_points_kind_asks_for_a_bullet_list() -> None:
    assert SUMMARY_PRESETS["key_points"].spec.output_format == "bullets"
