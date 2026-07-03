"""Compile the **User Context Document** injected into agent prompts.

MVP strategy (root README §7.2): simple profile injection — profile basics
+ recent memory understandings + active goals + a short recent-activity
summary. Designed so a vector/RAG retrieval step can be added later without
changing agent interfaces.
"""

from __future__ import annotations

from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.activity import ActivityLog
from app.models.enums import GoalStatus, PlannedTaskStatus
from app.models.goal import Goal
from app.models.memory import MemoryEntry
from app.models.metric import TrackedMetric
from app.models.planned_task import PlannedTask
from app.models.user import User
from app.models.user_profile import UserProfile
from app.models.user_setting import UserSetting

_MEMORY_LIMIT = 25


def summarize_recent_activity(db: Session, user: User, *, days: int = 7) -> str:
    """A compact text summary of the last ``days`` of activity."""
    today = date.today()
    since = today - timedelta(days=days)

    tasks = list(
        db.scalars(
            select(PlannedTask).where(
                PlannedTask.user_id == user.id,
                PlannedTask.date >= since,
            )
        )
    )
    total_tasks = len(tasks)
    done_tasks = sum(1 for t in tasks if t.status == PlannedTaskStatus.done)

    lines: list[str] = [
        f"- Planned tasks (last {days}d): {done_tasks}/{total_tasks} completed."
    ]

    metrics = list(
        db.scalars(
            select(TrackedMetric).where(
                TrackedMetric.user_id == user.id,
                TrackedMetric.active.is_(True),
            )
        )
    )
    for metric in metrics:
        values = list(
            db.scalars(
                select(ActivityLog.value).where(
                    ActivityLog.metric_id == metric.id,
                    ActivityLog.date >= since,
                )
            )
        )
        if not values:
            continue
        lines.append(
            f"- {metric.label}: {sum(values):g} {metric.unit.value} (last {days}d)."
        )

    return "\n".join(lines)


def compile_user_context(db: Session, user: User) -> str:
    """Build the full context document for ``user`` as plain text."""
    sections: list[str] = []

    sections.append(
        "## Profile\n"
        f"- Name: {user.name}\n"
        f"- Timezone: {user.timezone}\n"
        f"- Onboarding completed: {'yes' if user.onboarding_completed else 'no'}"
    )

    user_profile = db.scalar(
        select(UserProfile).where(UserProfile.user_id == user.id)
    )
    if user_profile is not None:
        profile_points: list[str] = []
        if user_profile.display_name:
            profile_points.append(f"- Preferred display name: {user_profile.display_name}")
        if user_profile.current_role:
            profile_points.append(f"- Current role: {user_profile.current_role}")
        if user_profile.current_goal:
            profile_points.append(f"- Current goal: {user_profile.current_goal}")
        if user_profile.profession:
            profile_points.append(f"- Profession: {user_profile.profession}")
        if user_profile.primary_tech_stack:
            profile_points.append(f"- Primary tech stack: {user_profile.primary_tech_stack}")
        if user_profile.working_style:
            profile_points.append(f"- Working style: {user_profile.working_style}")
        if user_profile.productivity_preferences:
            profile_points.append(
                f"- Productivity preferences: {user_profile.productivity_preferences}"
            )
        if user_profile.motivation:
            profile_points.append(f"- Motivation: {user_profile.motivation}")
        if user_profile.always_remember:
            profile_points.append(f"- Always remember: {user_profile.always_remember}")
        if profile_points:
            sections.append("## Structured AI profile\n" + "\n".join(profile_points))

    user_settings = db.scalar(
        select(UserSetting).where(UserSetting.user_id == user.id)
    )
    memory_enabled = user_settings.ai_memory_enabled if user_settings is not None else True

    if user_settings is not None:
        behavior_points = [
            f"- Preferred response length: {user_settings.ai_response_length.value}",
            f"- Preferred personality: {user_settings.ai_personality.value}",
            f"- Preferred AI model selection: {user_settings.ai_default_model}",
            f"- Smart planning: {'enabled' if user_settings.smart_planning_enabled else 'disabled'}",
        ]
        if not user_settings.ai_suggestions_enabled:
            behavior_points.append(
                "- Do not proactively suggest next actions unless the user asks for suggestions."
            )
        if not user_settings.smart_planning_enabled:
            behavior_points.append(
                "- Do not auto-create detailed plans unless the user explicitly requests planning help."
            )
        sections.append("## AI behavior preferences\n" + "\n".join(behavior_points))

    if memory_enabled:
        memories = list(
            db.scalars(
                select(MemoryEntry)
                .where(MemoryEntry.user_id == user.id)
                .order_by(MemoryEntry.created_at.desc())
                .limit(_MEMORY_LIMIT)
            )
        )
        if memories:
            bullets = "\n".join(
                f"- ({m.category.value}) {m.ai_understanding}" for m in memories
            )
            sections.append(f"## What we know about the user\n{bullets}")
    else:
        sections.append("## What we know about the user\n- Memory usage is disabled by user preference.")

    goals = list(
        db.scalars(
            select(Goal)
            .where(Goal.user_id == user.id, Goal.status == GoalStatus.active)
            .order_by(Goal.created_at.desc())
        )
    )
    if goals:
        bullets = "\n".join(f"- {g.title} — {g.progress}% complete" for g in goals)
        sections.append(f"## Active goals\n{bullets}")

    activity = summarize_recent_activity(db, user)
    if activity.strip():
        sections.append(f"## Recent activity\n{activity}")

    return "\n\n".join(sections)
