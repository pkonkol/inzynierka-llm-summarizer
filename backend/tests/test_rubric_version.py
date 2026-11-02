from dataclasses import replace

from app.services.metrics.deepeval import SUMMARY_SPECS, rubric_version


def test_rubric_version_is_stable_for_same_spec() -> None:
    spec = SUMMARY_SPECS[0]

    assert rubric_version(spec) == rubric_version(replace(spec))
    assert len(rubric_version(spec)) == 8


def test_rubric_version_changes_when_criteria_change() -> None:
    spec = SUMMARY_SPECS[0]

    assert rubric_version(spec) != rubric_version(replace(spec, criteria=spec.criteria + " "))
