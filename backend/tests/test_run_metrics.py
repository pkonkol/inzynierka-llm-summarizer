import pytest

from app.services import run_metrics


@pytest.fixture
def geval_names(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    names: list[str] = []

    async def record(settings: object, work: list) -> list:
        names.extend(spec.name for spec, _ in work)
        return []

    monkeypatch.setattr(run_metrics, "evaluate_geval", record)
    return names


async def test_a_prose_summary_gets_only_the_general_judges(geval_names: list[str]) -> None:
    await run_metrics.compute_deepeval_metrics("A summary.", "The source.", "prose")

    assert "summary_completeness" in geval_names
    assert "takeaways_non_redundancy" not in geval_names
    assert "takeaways_coverage" not in geval_names


async def test_a_bullet_list_also_gets_the_list_quality_judges(geval_names: list[str]) -> None:
    await run_metrics.compute_deepeval_metrics("- a\n- b", "The source.", "bullets")

    assert "summary_completeness" in geval_names
    assert "takeaways_non_redundancy" in geval_names
    assert "takeaways_coverage" in geval_names
    assert "summary_covers_takeaways" not in geval_names
