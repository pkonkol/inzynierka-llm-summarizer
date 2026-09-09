from app.services.evaluation_runner import summarize_entry_statuses


def test_all_completed_is_a_completed_run() -> None:
    assert summarize_entry_statuses(["completed", "completed"]) == ("completed", 2, 2, 0)


def test_a_single_failure_does_not_fail_the_run() -> None:
    run_status, entry_count, completed, failed = summarize_entry_statuses(
        ["completed", "failed", "completed"]
    )
    assert run_status == "completed"
    assert (entry_count, completed, failed) == (3, 2, 1)


def test_a_run_where_nothing_succeeded_is_failed() -> None:
    assert summarize_entry_statuses(["failed", "failed"]) == ("failed", 2, 0, 2)


def test_counts_cover_every_entry_including_a_resumed_run() -> None:
    # The whole point of counting from the document: after a resume the loop only touched the
    # entries that were still outstanding, so a per-invocation count would report 1 of 1.
    _, entry_count, completed, _ = summarize_entry_statuses(["completed", "completed", "completed"])
    assert (entry_count, completed) == (3, 3)
