from dataclasses import replace

from app.services.metrics.cross import PAIRWISE_WITH_INPUT
from app.services.metrics.deepeval import rubric_version


def test_rubric_version_is_stable_for_same_spec() -> None:
    spec = PAIRWISE_WITH_INPUT

    assert rubric_version(spec) == rubric_version(replace(spec))
    assert len(rubric_version(spec)) == 8


def test_rubric_version_changes_when_criteria_change() -> None:
    spec = PAIRWISE_WITH_INPUT

    assert rubric_version(spec) != rubric_version(replace(spec, criteria=spec.criteria + " "))
