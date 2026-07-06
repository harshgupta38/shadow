"""Plan workspace and generation API tests."""

from __future__ import annotations

from datetime import date, timedelta
from collections.abc import Iterator

from fastapi.testclient import TestClient

from app.api.deps import get_provider
from app.llm.base import LLMMessage, LLMProvider
from app.main import app


class ValidPlanProvider(LLMProvider):
    """Returns one valid structured daily-plan payload."""

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
            '{"tasks":[{"title":"AI Focus Block","priority":"high",'
            '"estimated_duration_minutes":50,"suggested_start_time":"09:00",'
            '"suggested_finish_by_time":"09:50","ai_rationale":"High-impact work first.",'
            '"ai_impact_if_skipped":"Missing this can reduce momentum for the day.",'
            '"ai_confidence_score":91}]}'
        )

    def generate_stream(
        self,
        messages: list[LLMMessage],
        *,
        system: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
        model: str | None = None,
    ) -> Iterator[str]:
        yield self.generate(
            messages,
            system=system,
            temperature=temperature,
            max_tokens=max_tokens,
            model=model,
        )


class PromptCapturePlanProvider(LLMProvider):
    """Captures prompts and returns one repetitive-task-aligned task."""

    def __init__(self) -> None:
        self.prompts: list[str] = []

    def generate(
        self,
        messages: list[LLMMessage],
        *,
        system: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
        model: str | None = None,
    ) -> str:
        if messages:
            self.prompts.append(messages[-1].content)
        return (
            '{"tasks":[{"title":"Aaryav Computer class","priority":"medium",'
            '"estimated_duration_minutes":45,"suggested_start_time":null,'
            '"suggested_finish_by_time":null,"ai_rationale":"Recurring class.",'
            '"ai_impact_if_skipped":"Skipping this can break routine continuity.",'
            '"ai_confidence_score":87}]}'
        )

    def generate_stream(
        self,
        messages: list[LLMMessage],
        *,
        system: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
        model: str | None = None,
    ) -> Iterator[str]:
        yield self.generate(
            messages,
            system=system,
            temperature=temperature,
            max_tokens=max_tokens,
            model=model,
        )


class DuplicateImpactPlanProvider(LLMProvider):
    """Returns multiple tasks with the same generic impact sentence."""

    def __init__(self, goal_id: int) -> None:
        self.goal_id = goal_id

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
            '{"tasks":[{'
            '"title":"LeetCode Problem of the day",'
            f'"related_goal_id":{self.goal_id},'
            '"priority":"critical",'
            '"estimated_duration_minutes":45,'
            '"suggested_start_time":"08:00",'
            '"suggested_finish_by_time":"08:45",'
            '"ai_rationale":"Protect your interview prep consistency.",'
            '"ai_impact_if_skipped":"Skipping this weakens your routine consistency and lowers momentum for today.",'
            '"ai_confidence_score":84'
            '},{'
            '"title":"10 LeetCode Problems",'
            f'"related_goal_id":{self.goal_id},'
            '"priority":"high",'
            '"estimated_duration_minutes":45,'
            '"suggested_start_time":"08:45",'
            '"suggested_finish_by_time":"09:30",'
            '"ai_rationale":"Reinforce problem-solving speed for interviews.",'
            '"ai_impact_if_skipped":"Skipping this weakens your routine consistency and lowers momentum for today.",'
            '"ai_confidence_score":84'
            '}]}'
        )

    def generate_stream(
        self,
        messages: list[LLMMessage],
        *,
        system: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
        model: str | None = None,
    ) -> Iterator[str]:
        yield self.generate(
            messages,
            system=system,
            temperature=temperature,
            max_tokens=max_tokens,
            model=model,
        )


class EmptyPlanProvider(LLMProvider):
    """Returns an empty plan payload so deterministic candidates are used."""

    def generate(
        self,
        messages: list[LLMMessage],
        *,
        system: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
        model: str | None = None,
    ) -> str:
        return '{"tasks":[]}'

    def generate_stream(
        self,
        messages: list[LLMMessage],
        *,
        system: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
        model: str | None = None,
    ) -> Iterator[str]:
        yield self.generate(
            messages,
            system=system,
            temperature=temperature,
            max_tokens=max_tokens,
            model=model,
        )


class EmptyPlanWithDurationEstimateProvider(LLMProvider):
    """Returns empty tasks first, then duration estimates for missing items."""

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
        if self.calls == 1:
            return '{"tasks":[]}'
        if self.calls == 2:
            return '{"durations":[{"title":"Daily Workout","estimated_duration_minutes":70}]}'
        return '{"durations":[]}'

    def generate_stream(
        self,
        messages: list[LLMMessage],
        *,
        system: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
        model: str | None = None,
    ) -> Iterator[str]:
        yield self.generate(
            messages,
            system=system,
            temperature=temperature,
            max_tokens=max_tokens,
            model=model,
        )


def test_generate_today_blocks_when_smart_planning_disabled(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    disabled = client.put(
        "/api/settings/ai-behavior",
        headers=auth_headers,
        json={"smart_planning_enabled": False},
    )
    assert disabled.status_code == 200

    response = client.post("/api/plan/generate-today", headers=auth_headers, json={})
    assert response.status_code == 400
    assert "Smart planning is disabled" in response.json()["detail"]


def test_generate_today_replaces_ai_tasks_but_keeps_manual_tasks(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    today = date.today().isoformat()

    goal = client.post(
        "/api/goals",
        headers=auth_headers,
        json={"title": "Ship MVP"},
    )
    assert goal.status_code == 201

    manual = client.post(
        "/api/plan",
        headers=auth_headers,
        json={"title": "Manual deep work", "date": today},
    )
    assert manual.status_code == 201

    old_ai = client.post(
        "/api/plan",
        headers=auth_headers,
        json={"title": "Old generated", "date": today, "source": "ai_generated"},
    )
    assert old_ai.status_code == 201

    generated = client.post("/api/plan/generate-today", headers=auth_headers, json={})
    assert generated.status_code == 200

    tasks = client.get(f"/api/plan?on_date={today}", headers=auth_headers)
    assert tasks.status_code == 200

    titles = [task["title"] for task in tasks.json()]
    sources = [task["source"] for task in tasks.json()]

    assert "Manual deep work" in titles
    assert "Old generated" not in titles
    assert "ai_generated" in sources


def test_workspace_includes_insights_and_execution_order(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    today = date.today()
    yesterday = (today - timedelta(days=1)).isoformat()

    yesterday_task = client.post(
        "/api/plan",
        headers=auth_headers,
        json={
            "title": "Finish architecture review",
            "date": yesterday,
            "priority": "high",
            "estimated_duration_minutes": 60,
        },
    )
    assert yesterday_task.status_code == 201

    generate = client.post("/api/plan/generate-today", headers=auth_headers, json={})
    assert generate.status_code == 200

    workspace = client.get(
        f"/api/plan/workspace?on_date={today.isoformat()}",
        headers=auth_headers,
    )
    assert workspace.status_code == 200

    body = workspace.json()
    assert body["date"] == today.isoformat()
    assert body["insights"]["missed_yesterday_count"] >= 1
    assert body["insights"]["carry_forward_count"] >= 1
    assert isinstance(body["execution_order"], list)
    assert len(body["execution_order"]) >= 1
    first_execution_item = body["execution_order"][0]
    assert "suggested_start_time" in first_execution_item
    assert "suggested_finish_by_time" in first_execution_item


def test_generate_today_excludes_repetitive_from_carry_forward(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    today = date.today().isoformat()
    yesterday = (date.today() - timedelta(days=1)).isoformat()

    repetitive = client.post(
        "/api/repetitive-tasks",
        headers=auth_headers,
        json={
            "name": "Daily Workout",
            "description": "Morning workout",
            "frequencies": ["daily"],
            "priority": "high",
        },
    )
    assert repetitive.status_code == 201

    manual_yesterday = client.post(
        "/api/plan",
        headers=auth_headers,
        json={"title": "Follow up recruiter", "date": yesterday, "source": "manual"},
    )
    assert manual_yesterday.status_code == 201

    repetitive_yesterday = client.post(
        "/api/plan",
        headers=auth_headers,
        json={"title": "Daily Workout", "date": yesterday, "source": "ai_generated"},
    )
    assert repetitive_yesterday.status_code == 201

    generated = client.post(
        "/api/plan/generate-today",
        headers=auth_headers,
        json={"on_date": today},
    )
    assert generated.status_code == 200

    body = generated.json()
    assert "Follow up recruiter" in body["insights"]["carry_forward_titles"]
    assert "Daily Workout" not in body["insights"]["carry_forward_titles"]
    assert not any(
        task["title"] == "Daily Workout" and task["carried_from_date"] == yesterday
        for task in body["tasks"]
    )


def test_workspace_returns_enriched_task_metadata_and_habit_summary(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    today = date.today()
    yesterday = today - timedelta(days=1)
    two_days_ago = today - timedelta(days=2)

    goal = client.post(
        "/api/goals",
        headers=auth_headers,
        json={"title": "Interview Prep", "category": "Career"},
    )
    assert goal.status_code == 201
    goal_id = int(goal.json()["id"])

    repetitive = client.post(
        "/api/repetitive-tasks",
        headers=auth_headers,
        json={
            "name": "Daily Revision",
            "description": "Revise DSA concepts",
            "frequencies": ["daily"],
            "priority": "high",
            "linked_goal_ids": [goal_id],
        },
    )
    assert repetitive.status_code == 201

    for day in [two_days_ago, yesterday]:
        created = client.post(
            "/api/plan",
            headers=auth_headers,
            json={
                "title": "Daily Revision",
                "date": day.isoformat(),
                "source": "ai_generated",
                "related_goal_id": goal_id,
                "suggested_finish_by_time": "00:01",
                "ai_impact_if_skipped": "Progress decays when this is skipped.",
                "ai_confidence_score": 92,
            },
        )
        assert created.status_code == 201
        mark_done = client.put(
            f"/api/plan/{created.json()['id']}",
            headers=auth_headers,
            json={"status": "done"},
        )
        assert mark_done.status_code == 200

    generate = client.post(
        "/api/plan/generate-today",
        headers=auth_headers,
        json={"on_date": today.isoformat()},
    )
    assert generate.status_code == 200

    workspace = client.get(
        f"/api/plan/workspace?on_date={today.isoformat()}",
        headers=auth_headers,
    )
    assert workspace.status_code == 200

    body = workspace.json()
    task = next(row for row in body["tasks"] if row["title"] == "Daily Revision")
    assert task["category"] in {"Habit", "Career", "Goal"}
    assert task["goal_title"] in {"Interview Prep", None}
    assert isinstance(task["missed_yesterday"], bool)
    assert isinstance(task["overdue"], bool)
    assert isinstance(task["completed_late"], bool)
    assert task["current_habit_streak"] is None or task["current_habit_streak"] >= 0
    assert task["previous_completion_history"] is None or isinstance(
        task["previous_completion_history"],
        str,
    )
    assert task["ai_confidence_score"] is None or 0 <= task["ai_confidence_score"] <= 100

    habit_summary = body["insights"]["habit_streak_summary"]
    assert isinstance(habit_summary, list)
    daily_revision = next(item for item in habit_summary if item["task_title"] == "Daily Revision")
    assert daily_revision["highest_streak_days"] >= daily_revision["current_streak_days"]


def test_generate_today_uses_valid_ai_payload_when_available(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    app.dependency_overrides[get_provider] = lambda: ValidPlanProvider()

    try:
        response = client.post("/api/plan/generate-today", headers=auth_headers, json={})
        assert response.status_code == 200

        tasks = response.json()["tasks"]
        assert any(task["title"] == "AI Focus Block" for task in tasks)
        ai_task = next(task for task in tasks if task["title"] == "AI Focus Block")
        assert ai_task["source"] == "ai_generated"
        assert ai_task["suggested_start_time"] == "09:00"
        assert ai_task["priority"] == "high"
        assert ai_task["ai_impact_if_skipped"]
        assert ai_task["ai_confidence_score"] == 91
    finally:
        app.dependency_overrides.pop(get_provider, None)


def test_generate_today_personalizes_duplicate_impact_copy(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    goal = client.post(
        "/api/goals",
        headers=auth_headers,
        json={"title": "Secure SDE 1 role at MAANG"},
    )
    assert goal.status_code == 201
    goal_id = int(goal.json()["id"])

    app.dependency_overrides[get_provider] = lambda: DuplicateImpactPlanProvider(goal_id)

    try:
        response = client.post("/api/plan/generate-today", headers=auth_headers, json={})
        assert response.status_code == 200

        tasks = response.json()["tasks"]
        impacts_by_title = {
            task["title"]: task["ai_impact_if_skipped"]
            for task in tasks
            if task["title"] in {"LeetCode Problem of the day", "10 LeetCode Problems"}
        }
        assert len(impacts_by_title) == 2

        first_impact = impacts_by_title["LeetCode Problem of the day"]
        second_impact = impacts_by_title["10 LeetCode Problems"]

        assert first_impact != second_impact
        assert "weakens your routine consistency and lowers momentum for today" not in first_impact.lower()
        assert "weakens your routine consistency and lowers momentum for today" not in second_impact.lower()
        assert "LeetCode Problem of the day" in first_impact
        assert "10 LeetCode Problems" in second_impact
        assert "Secure SDE 1 role at MAANG" in first_impact
        assert "Secure SDE 1 role at MAANG" in second_impact
    finally:
        app.dependency_overrides.pop(get_provider, None)


def test_generate_today_uses_repetitive_description_for_prompt_and_timing(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    provider = PromptCapturePlanProvider()
    app.dependency_overrides[get_provider] = lambda: provider

    try:
        goal = client.post(
            "/api/goals",
            headers=auth_headers,
            json={"title": "Secure SDE 1 role at MAANG"},
        )
        assert goal.status_code == 201
        goal_id = int(goal.json()["id"])

        repetitive = client.post(
            "/api/repetitive-tasks",
            headers=auth_headers,
            json={
                "name": "Aaryav Computer class",
                "description": "Class from 10am to 11:30am.",
                "frequencies": ["daily"],
                "priority": "medium",
                "linked_goal_ids": [goal_id],
            },
        )
        assert repetitive.status_code == 201

        response = client.post("/api/plan/generate-today", headers=auth_headers, json={})
        assert response.status_code == 200

        full_prompt = "\n".join(provider.prompts)
        assert "Aaryav Computer class" in full_prompt
        assert "Class from 10am to 11:30am." in full_prompt

        tasks = response.json()["tasks"]
        row = next(task for task in tasks if task["title"] == "Aaryav Computer class")
        assert row["estimated_duration_minutes"] == 90
        assert row["suggested_start_time"] == "10:00"
        assert row["suggested_finish_by_time"] == "11:30"
        assert row["related_goal_id"] == goal_id
    finally:
        app.dependency_overrides.pop(get_provider, None)


def test_generate_today_applies_repetitive_duration_hints_without_time_window(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    app.dependency_overrides[get_provider] = lambda: EmptyPlanProvider()

    try:
        first = client.post(
            "/api/repetitive-tasks",
            headers=auth_headers,
            json={
                "name": "LeetCode Problem of the day",
                "description": "Solve one question. It will take 45mins.",
                "frequencies": ["daily"],
                "priority": "high",
            },
        )
        assert first.status_code == 201

        second = client.post(
            "/api/repetitive-tasks",
            headers=auth_headers,
            json={
                "name": "DSA Revision Block",
                "description": "Daily revision; it can be any 2hr slot.",
                "frequencies": ["daily"],
                "priority": "medium",
            },
        )
        assert second.status_code == 201

        response = client.post("/api/plan/generate-today", headers=auth_headers, json={})
        assert response.status_code == 200

        tasks = response.json()["tasks"]

        leetcode = next(task for task in tasks if task["title"] == "LeetCode Problem of the day")
        assert leetcode["estimated_duration_minutes"] == 45
        assert leetcode["suggested_start_time"] is None
        assert leetcode["suggested_finish_by_time"] is None

        revision = next(task for task in tasks if task["title"] == "DSA Revision Block")
        assert revision["estimated_duration_minutes"] == 120
        assert revision["suggested_start_time"] is None
        assert revision["suggested_finish_by_time"] is None
    finally:
        app.dependency_overrides.pop(get_provider, None)


def test_generate_today_does_not_set_fallback_timing_when_llm_returns_no_tasks(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    app.dependency_overrides[get_provider] = lambda: EmptyPlanProvider()

    try:
        repetitive = client.post(
            "/api/repetitive-tasks",
            headers=auth_headers,
            json={
                "name": "Daily Workout",
                "description": "Morning workout",
                "frequencies": ["daily"],
                "priority": "high",
            },
        )
        assert repetitive.status_code == 201

        response = client.post("/api/plan/generate-today", headers=auth_headers, json={})
        assert response.status_code == 200

        tasks = response.json()["tasks"]
        row = next(task for task in tasks if task["title"] == "Daily Workout")
        assert row["estimated_duration_minutes"] is None
        assert row["suggested_start_time"] is None
        assert row["suggested_finish_by_time"] is None
    finally:
        app.dependency_overrides.pop(get_provider, None)


def test_generate_today_estimates_missing_duration_with_llm_when_no_user_time_window(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    app.dependency_overrides[get_provider] = lambda: EmptyPlanWithDurationEstimateProvider()

    try:
        repetitive = client.post(
            "/api/repetitive-tasks",
            headers=auth_headers,
            json={
                "name": "Daily Workout",
                "description": "Morning workout",
                "frequencies": ["daily"],
                "priority": "high",
            },
        )
        assert repetitive.status_code == 201

        response = client.post("/api/plan/generate-today", headers=auth_headers, json={})
        assert response.status_code == 200

        tasks = response.json()["tasks"]
        row = next(task for task in tasks if task["title"] == "Daily Workout")
        assert row["estimated_duration_minutes"] == 70
        assert row["suggested_start_time"] is None
        assert row["suggested_finish_by_time"] is None
    finally:
        app.dependency_overrides.pop(get_provider, None)
