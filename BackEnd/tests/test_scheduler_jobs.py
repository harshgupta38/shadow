"""Scheduler notification behavior tests."""

from __future__ import annotations

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

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


def test_enqueue_daily_reports_generates_once_per_day(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    created = scheduler_jobs.enqueue_daily_reports(
        now_utc=datetime(2026, 7, 5, 18, 25, tzinfo=timezone.utc),
    )
    assert created == 1

    history = client.get("/api/reports/history", headers=auth_headers).json()
    assert len(history) == 1
    history_date = history[0]["history_date"]

    versions = client.get(
        f"/api/reports/history/{history_date}",
        headers=auth_headers,
    ).json()
    assert len(versions) == 1
    assert versions[0]["source"] == "automatic"
    assert versions[0]["period"] == "daily"

    notifications = client.get("/api/notifications", headers=auth_headers).json()
    daily_ready = [row for row in notifications if row["title"] == "Daily Report Ready"]
    assert len(daily_ready) == 1

    created_again = scheduler_jobs.enqueue_daily_reports(
        now_utc=datetime(2026, 7, 5, 18, 40, tzinfo=timezone.utc),
    )
    assert created_again == 0

    notifications_after = client.get("/api/notifications", headers=auth_headers).json()
    daily_ready_after = [row for row in notifications_after if row["title"] == "Daily Report Ready"]
    assert len(daily_ready_after) == 1


def test_enqueue_weekly_reports_generates_once_per_week_window(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    created = scheduler_jobs.enqueue_weekly_reports(
        now_utc=datetime(2026, 7, 11, 18, 25, tzinfo=timezone.utc),
    )
    assert created == 1

    history = client.get("/api/reports/history", headers=auth_headers).json()
    assert len(history) == 1
    history_date = history[0]["history_date"]

    versions = client.get(
        f"/api/reports/history/{history_date}",
        headers=auth_headers,
    ).json()
    assert len(versions) == 1
    assert versions[0]["source"] == "automatic"
    assert versions[0]["period"] == "weekly"

    notifications = client.get("/api/notifications", headers=auth_headers).json()
    weekly_ready = [row for row in notifications if row["title"] == "Weekly Report Ready"]
    assert len(weekly_ready) == 1

    created_again = scheduler_jobs.enqueue_weekly_reports(
        now_utc=datetime(2026, 7, 11, 19, 0, tzinfo=timezone.utc),
    )
    assert created_again == 0

    notifications_after = client.get("/api/notifications", headers=auth_headers).json()
    weekly_ready_after = [row for row in notifications_after if row["title"] == "Weekly Report Ready"]
    assert len(weekly_ready_after) == 1


def test_enqueue_daily_reports_respects_automation_enablement(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    updated = client.put(
        "/api/reports/automation",
        headers=auth_headers,
        json={
            "enabled": False,
        },
    )
    assert updated.status_code == 200

    created = scheduler_jobs.enqueue_daily_reports(
        now_utc=datetime(2026, 7, 5, 18, 30, tzinfo=timezone.utc),
    )
    assert created == 0

    history = client.get("/api/reports/history", headers=auth_headers).json()
    assert history == []


def test_enqueue_weekly_reports_respects_configured_day_and_time(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    updated = client.put(
        "/api/reports/automation",
        headers=auth_headers,
        json={
            "enabled": True,
            "weekly_enabled": True,
            "weekly_day": "monday",
            "weekly_time": "23:59",
        },
    )
    assert updated.status_code == 200

    me = client.get("/api/auth/me", headers=auth_headers)
    assert me.status_code == 200
    user_tz = ZoneInfo(me.json()["timezone"])

    not_due_local = datetime(2026, 7, 12, 23, 59, tzinfo=user_tz)  # Sunday
    still_early_local = datetime(2026, 7, 13, 23, 58, tzinfo=user_tz)  # Monday
    due_local = datetime(2026, 7, 13, 23, 59, tzinfo=user_tz)  # Monday

    not_due = scheduler_jobs.enqueue_weekly_reports(
        now_utc=not_due_local.astimezone(timezone.utc),
    )
    assert not_due == 0

    still_early = scheduler_jobs.enqueue_weekly_reports(
        now_utc=still_early_local.astimezone(timezone.utc),
    )
    assert still_early == 0

    created = scheduler_jobs.enqueue_weekly_reports(
        now_utc=due_local.astimezone(timezone.utc),
    )
    assert created == 1

    history = client.get("/api/reports/history", headers=auth_headers).json()
    assert len(history) == 1
    history_date = history[0]["history_date"]
    versions = client.get(
        f"/api/reports/history/{history_date}",
        headers=auth_headers,
    ).json()
    assert len(versions) == 1
    assert versions[0]["period"] == "weekly"
    assert versions[0]["source"] == "automatic"
