"""Repetitive task API tests."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.api.deps import get_provider
from app.llm.base import LLMMessage, LLMProvider
from app.main import app

from tests.conftest import register_and_login


class ProgressMetricRecommendationProvider(LLMProvider):
    def __init__(self) -> None:
        self.calls = 0

    def generate(
        self,
        messages: list[LLMMessage],
        *,
        system: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
        model: str | None = None,
    ) -> str:
        self.calls += 1
        prompt = messages[-1].content if messages else ""
        if "Habit name" in prompt and "Drink Water" in prompt:
            return (
                '{"measurable":true,"metric_name":"Water intake","unit":"liter",'
                '"daily_target":2.5,"rationale":"Hydration is quantifiable daily."}'
            )
        if "Habit name" in prompt and "LeetCode" in prompt:
            return (
                '{"measurable":true,"metric_name":"LeetCode solved","unit":"count",'
                '"daily_target":10,"rationale":"Problems solved is directly measurable."}'
            )
        if "Habit name" in prompt and "Weekly Run" in prompt:
            return (
                '{"measurable":true,"metric_name":"Run minutes","unit":"minutes",'
                '"daily_target":180,"rationale":"Running volume is measurable each week."}'
            )
        if "Habit name" in prompt and "Monthly Run" in prompt:
            return (
                '{"measurable":true,"metric_name":"Run minutes","unit":"minutes",'
                '"daily_target":300,"rationale":"Running volume is measurable each month."}'
            )
        return (
            '{"measurable":false,"metric_name":null,"unit":null,'
            '"daily_target":null,"rationale":"Not quantifiable as a daily metric."}'
        )


class AlwaysMeasurableRecommendationProvider(LLMProvider):
    def generate(
        self,
        messages: list[LLMMessage],
        *,
        system: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
        model: str | None = None,
    ) -> str:
        return (
            '{"measurable":true,"metric_name":"Office attendance","unit":"count",'
            '"daily_target":1,"rationale":"Daily completion count."}'
        )


class CustomWaterRecommendationProvider(LLMProvider):
    def generate(
        self,
        messages: list[LLMMessage],
        *,
        system: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
        model: str | None = None,
    ) -> str:
        return (
            '{"measurable":true,"metric_name":"Water intake","unit":"custom",'
            '"daily_target":2000,"rationale":"Track hydration daily."}'
        )


class CustomLitersWaterRecommendationProvider(LLMProvider):
    def generate(
        self,
        messages: list[LLMMessage],
        *,
        system: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
        model: str | None = None,
    ) -> str:
        return (
            '{"measurable":true,"metric_name":"Water intake","unit":"custom",'
            '"daily_target":2,"rationale":"Track hydration daily."}'
        )


def _create_goal(client: TestClient, headers: dict[str, str], title: str = "Google prep") -> int:
    response = client.post(
        "/api/goals",
        headers=headers,
        json={"title": title, "category": "Career"},
    )
    assert response.status_code == 201
    return int(response.json()["id"])


def _create_metric(
    client: TestClient,
    headers: dict[str, str],
    *,
    key: str,
    label: str,
) -> int:
    response = client.post(
        "/api/metrics",
        headers=headers,
        json={
            "key": key,
            "label": label,
            "unit_text": "count",
            "time_span": "day",
        },
    )
    assert response.status_code == 201
    return int(response.json()["id"])


def test_create_update_list_and_delete_repetitive_task(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    goal_id = _create_goal(client, auth_headers, "Google Interview")
    metric_id = _create_metric(
        client,
        auth_headers,
        key="leetcode_solved",
        label="LeetCode solved",
    )

    created = client.post(
        "/api/repetitive-tasks",
        headers=auth_headers,
        json={
            "name": "LeetCode practice",
            "description": "Daily DSA reps",
            "frequencies": ["weekdays"],
            "priority": "critical",
            "linked_goal_ids": [goal_id],
            "linked_metric_ids": [metric_id],
        },
    )
    assert created.status_code == 201
    body = created.json()
    assert body["name"] == "LeetCode practice"
    assert body["status"] == "active"
    assert body["linked_goal_ids"] == [goal_id]
    assert body["linked_metric_ids"] == [metric_id]

    task_id = body["id"]

    listing = client.get("/api/repetitive-tasks", headers=auth_headers)
    assert listing.status_code == 200
    assert any(item["id"] == task_id for item in listing.json())

    updated = client.put(
        f"/api/repetitive-tasks/{task_id}",
        headers=auth_headers,
        json={
            "status": "paused",
            "frequencies": ["monday", "wednesday", "friday"],
            "linked_goal_ids": [],
            "linked_metric_ids": [metric_id],
        },
    )
    assert updated.status_code == 200
    updated_body = updated.json()
    assert updated_body["status"] == "paused"
    assert updated_body["frequencies"] == ["monday", "wednesday", "friday"]
    assert updated_body["linked_goal_ids"] == []
    assert updated_body["linked_metric_ids"] == [metric_id]

    paused_listing = client.get(
        "/api/repetitive-tasks",
        headers=auth_headers,
        params={"status": "paused"},
    )
    assert paused_listing.status_code == 200
    assert len(paused_listing.json()) == 1
    assert paused_listing.json()[0]["id"] == task_id

    deleted = client.delete(f"/api/repetitive-tasks/{task_id}", headers=auth_headers)
    assert deleted.status_code == 204

    final_listing = client.get("/api/repetitive-tasks", headers=auth_headers)
    assert final_listing.status_code == 200
    assert final_listing.json() == []


def test_repetitive_task_links_must_be_owned(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    goal_id = _create_goal(client, auth_headers, "Private goal")
    other_headers = register_and_login(client, email="other@example.com")

    response = client.post(
        "/api/repetitive-tasks",
        headers=other_headers,
        json={
            "name": "Unauthorized link",
            "frequencies": ["daily"],
            "priority": "medium",
            "linked_goal_ids": [goal_id],
        },
    )
    assert response.status_code == 404


def test_repetitive_task_recommendations_are_api_backed_and_skip_existing(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    _create_goal(client, auth_headers, "Join Google")
    _create_metric(
        client,
        auth_headers,
        key="leetcode_solved",
        label="LeetCode solved",
    )

    initial = client.get("/api/repetitive-tasks/recommendations", headers=auth_headers)
    assert initial.status_code == 200
    recommendations = initial.json()
    assert len(recommendations) > 0
    assert all(len(item["frequencies"]) > 0 for item in recommendations)

    first_name = recommendations[0]["name"]
    created = client.post(
        "/api/repetitive-tasks",
        headers=auth_headers,
        json={
            "name": first_name,
            "frequencies": ["daily"],
            "priority": "medium",
        },
    )
    assert created.status_code == 201

    refreshed = client.get("/api/repetitive-tasks/recommendations", headers=auth_headers)
    assert refreshed.status_code == 200
    refreshed_names = {item["name"] for item in refreshed.json()}
    assert first_name not in refreshed_names


def test_create_habit_generates_progress_metric_recommendation(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    provider = ProgressMetricRecommendationProvider()
    app.dependency_overrides[get_provider] = lambda: provider

    try:
        created = client.post(
            "/api/repetitive-tasks",
            headers=auth_headers,
            json={
                "name": "Drink Water",
                "description": "Drink 2.5L per day",
                "frequencies": ["daily"],
                "priority": "high",
            },
        )
        assert created.status_code == 201
        habit_id = created.json()["id"]

        recommendations = client.get(
            "/api/metrics/progress-coach-recommendations",
            headers=auth_headers,
        )
        assert recommendations.status_code == 200
        rows = recommendations.json()
        assert len(rows) == 1
        assert rows[0]["habit_id"] == habit_id
        assert rows[0]["unit"] == "custom"
        assert rows[0]["unit_hint"] == "ml"
        assert rows[0]["target"] == 2500

        # Internal recommendation storage should never leak into notifications feed.
        notifications = client.get("/api/notifications", headers=auth_headers)
        assert notifications.status_code == 200
        assert all(
            "__internal_progress_coach_metric_recommendation__" not in row["title"]
            for row in notifications.json()
        )
        assert any(
            row["title"].startswith("Progress Coach recommendation:")
            for row in notifications.json()
        )
    finally:
        app.dependency_overrides.pop(get_provider, None)


def test_update_habit_replaces_pending_progress_recommendation(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    provider = ProgressMetricRecommendationProvider()
    app.dependency_overrides[get_provider] = lambda: provider

    try:
        created = client.post(
            "/api/repetitive-tasks",
            headers=auth_headers,
            json={
                "name": "Drink Water",
                "description": "Drink 2.5L per day",
                "frequencies": ["daily"],
                "priority": "high",
            },
        )
        assert created.status_code == 201
        task_id = created.json()["id"]

        initial = client.get("/api/metrics/progress-coach-recommendations", headers=auth_headers)
        assert initial.status_code == 200
        assert len(initial.json()) == 1

        updated = client.put(
            f"/api/repetitive-tasks/{task_id}",
            headers=auth_headers,
            json={
                "name": "LeetCode practice",
                "description": "Solve 10 daily",
                "frequencies": ["daily"],
                "priority": "critical",
            },
        )
        assert updated.status_code == 200

        refreshed = client.get("/api/metrics/progress-coach-recommendations", headers=auth_headers)
        assert refreshed.status_code == 200
        rows = refreshed.json()
        assert len(rows) == 1
        assert rows[0]["habit_id"] == task_id
        assert rows[0]["metric_name"] == "LeetCode solved"
        assert rows[0]["target"] == 10
        assert rows[0]["time_span"] == "day"
    finally:
        app.dependency_overrides.pop(get_provider, None)


def test_create_weekly_habit_recommendation_uses_week_time_span(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    provider = ProgressMetricRecommendationProvider()
    app.dependency_overrides[get_provider] = lambda: provider

    try:
        created = client.post(
            "/api/repetitive-tasks",
            headers=auth_headers,
            json={
                "name": "Weekly Run",
                "description": "Run 180 minutes weekly",
                "frequencies": ["weekly"],
                "priority": "high",
            },
        )
        assert created.status_code == 201

        recommendations = client.get(
            "/api/metrics/progress-coach-recommendations",
            headers=auth_headers,
        )
        assert recommendations.status_code == 200
        rows = recommendations.json()
        assert len(rows) == 1
        assert rows[0]["metric_name"] == "Run minutes"
        assert rows[0]["time_span"] == "week"
    finally:
        app.dependency_overrides.pop(get_provider, None)


def test_create_monthly_habit_recommendation_uses_month_time_span(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    provider = ProgressMetricRecommendationProvider()
    app.dependency_overrides[get_provider] = lambda: provider

    try:
        created = client.post(
            "/api/repetitive-tasks",
            headers=auth_headers,
            json={
                "name": "Monthly Run",
                "description": "Run 300 minutes monthly",
                "frequencies": ["monthly"],
                "priority": "high",
            },
        )
        assert created.status_code == 201

        recommendations = client.get(
            "/api/metrics/progress-coach-recommendations",
            headers=auth_headers,
        )
        assert recommendations.status_code == 200
        rows = recommendations.json()
        assert len(rows) == 1
        assert rows[0]["metric_name"] == "Run minutes"
        assert rows[0]["time_span"] == "month"
    finally:
        app.dependency_overrides.pop(get_provider, None)


def test_create_habit_accepts_custom_unit_recommendation_for_water(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    provider = CustomWaterRecommendationProvider()
    app.dependency_overrides[get_provider] = lambda: provider

    try:
        created = client.post(
            "/api/repetitive-tasks",
            headers=auth_headers,
            json={
                "name": "Drink water",
                "description": "Drink 2000ml water daily",
                "frequencies": ["daily"],
                "priority": "medium",
            },
        )
        assert created.status_code == 201

        recommendations = client.get(
            "/api/metrics/progress-coach-recommendations",
            headers=auth_headers,
        )
        assert recommendations.status_code == 200
        rows = recommendations.json()
        assert len(rows) == 1
        assert rows[0]["metric_name"] == "Water intake"
        assert rows[0]["unit"] == "custom"
        assert rows[0]["unit_hint"] == "ml"
        assert rows[0]["target"] == 2000
    finally:
        app.dependency_overrides.pop(get_provider, None)


def test_create_habit_converts_custom_liters_target_to_ml(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    provider = CustomLitersWaterRecommendationProvider()
    app.dependency_overrides[get_provider] = lambda: provider

    try:
        created = client.post(
            "/api/repetitive-tasks",
            headers=auth_headers,
            json={
                "name": "Drink water",
                "description": "Drink 2L water daily",
                "frequencies": ["daily"],
                "priority": "medium",
            },
        )
        assert created.status_code == 201

        recommendations = client.get(
            "/api/metrics/progress-coach-recommendations",
            headers=auth_headers,
        )
        assert recommendations.status_code == 200
        rows = recommendations.json()
        assert len(rows) == 1
        assert rows[0]["unit"] == "custom"
        assert rows[0]["unit_hint"] == "ml"
        assert rows[0]["target"] == 2000
    finally:
        app.dependency_overrides.pop(get_provider, None)


def test_habit_update_with_active_linked_metric_clears_pending_without_new_one(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    provider = ProgressMetricRecommendationProvider()
    app.dependency_overrides[get_provider] = lambda: provider

    try:
        created = client.post(
            "/api/repetitive-tasks",
            headers=auth_headers,
            json={
                "name": "Drink Water",
                "description": "Drink 2.5L per day",
                "frequencies": ["daily"],
                "priority": "high",
            },
        )
        assert created.status_code == 201
        task_id = created.json()["id"]

        # Accept recommendation to create and link the active metric.
        rows = client.get("/api/metrics/progress-coach-recommendations", headers=auth_headers).json()
        recommendation_id = rows[0]["id"]
        accepted = client.post(
            f"/api/metrics/progress-coach-recommendations/{recommendation_id}/accept",
            headers=auth_headers,
        )
        assert accepted.status_code == 200

        # Updating the habit should not create a new pending recommendation because
        # the habit already has an active linked metric.
        updated = client.put(
            f"/api/repetitive-tasks/{task_id}",
            headers=auth_headers,
            json={"description": "Still daily hydration"},
        )
        assert updated.status_code == 200

        refreshed = client.get("/api/metrics/progress-coach-recommendations", headers=auth_headers)
        assert refreshed.status_code == 200
        assert refreshed.json() == []
    finally:
        app.dependency_overrides.pop(get_provider, None)


def test_non_quantifiable_habit_is_filtered_even_if_llm_marks_measurable(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    provider = AlwaysMeasurableRecommendationProvider()
    app.dependency_overrides[get_provider] = lambda: provider

    try:
        created = client.post(
            "/api/repetitive-tasks",
            headers=auth_headers,
            json={
                "name": "Work from office",
                "description": "Travel and attend office on weekdays",
                "frequencies": ["weekdays"],
                "priority": "medium",
            },
        )
        assert created.status_code == 201

        recommendations = client.get(
            "/api/metrics/progress-coach-recommendations",
            headers=auth_headers,
        )
        assert recommendations.status_code == 200
        assert recommendations.json() == []
    finally:
        app.dependency_overrides.pop(get_provider, None)
