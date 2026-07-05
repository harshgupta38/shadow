"""Scheduler notification behavior tests."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi.testclient import TestClient

import app.scheduler.jobs as scheduler_jobs


def test_enqueue_daily_briefs_catches_up_after_target_time(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    created = scheduler_jobs.enqueue_daily_briefs(
        now_utc=datetime(2026, 7, 5, 5, 45, tzinfo=timezone.utc),
    )
    assert created == 1

    rows = client.get("/api/notifications", headers=auth_headers).json()
    assert any(row["title"] == "Daily Brief" for row in rows)

    created_again = scheduler_jobs.enqueue_daily_briefs(
        now_utc=datetime(2026, 7, 5, 6, 0, tzinfo=timezone.utc),
    )
    assert created_again == 0


def test_enqueue_daily_briefs_does_not_queue_before_target_time(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    created = scheduler_jobs.enqueue_daily_briefs(
        now_utc=datetime(2026, 7, 5, 0, 15, tzinfo=timezone.utc),
    )
    assert created == 0

    rows = client.get("/api/notifications", headers=auth_headers).json()
    assert rows == []


def test_enqueue_weekly_summaries_catches_up_after_target_time(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    created = scheduler_jobs.enqueue_weekly_summaries(
        now_utc=datetime(2026, 7, 5, 5, 45, tzinfo=timezone.utc),
    )
    assert created == 1

    rows = client.get("/api/notifications", headers=auth_headers).json()
    assert any(row["title"] == "Weekly Summary" for row in rows)
