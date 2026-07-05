"""Profile domain service: basic identity + structured AI profile."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.activity import ActivityLog
from app.models.chat import ChatMessage, ChatSession
from app.models.goal import Goal
from app.models.journal import JournalEntry
from app.models.memory import MemoryEntry
from app.models.metric import TrackedMetric
from app.models.milestone import Milestone
from app.models.notification import Notification
from app.models.planned_task import PlannedTask
from app.models.report import Report
from app.models.user import User
from app.models.user_profile import UserProfile
from app.schemas.profile import (
    AccountDataExportRead,
    AccountOverviewRead,
    AIProfileRead,
    AIProfileUpdate,
    BasicProfileRead,
    BasicProfileUpdate,
    ChatHistoryClearResult,
)
from app.services.auth_service import get_email_verification_retry_after_seconds
from app.services.exceptions import ConflictError


def _get_or_create_profile(db: Session, user: User) -> UserProfile:
    profile = db.scalar(select(UserProfile).where(UserProfile.user_id == user.id))
    if profile is not None:
        return profile

    profile = UserProfile(
        user_id=user.id,
        display_name=user.name,
        current_goal="Stay consistent with my goals",
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


def get_basic_profile(db: Session, user: User) -> BasicProfileRead:
    profile = _get_or_create_profile(db, user)
    return BasicProfileRead.model_validate(
        {
            "user_id": user.id,
            "email": user.email,
            "name": user.name,
            "timezone": user.timezone,
            "member_since": user.created_at,
            "display_name": profile.display_name,
            "profile_picture_url": profile.profile_picture_url,
            "current_role": profile.current_role,
            "current_goal": profile.current_goal,
            "phone_number": profile.phone_number,
            "short_bio": profile.short_bio,
        }
    )


def update_basic_profile(db: Session, user: User, data: BasicProfileUpdate) -> BasicProfileRead:
    profile = _get_or_create_profile(db, user)
    updates = data.model_dump(exclude_unset=True)

    if "name" in updates and updates["name"] is not None:
        user.name = updates["name"].strip()
    user.timezone = "Asia/Kolkata"

    profile_fields = {
        "display_name",
        "profile_picture_url",
        "current_role",
        "current_goal",
        "phone_number",
        "short_bio",
    }
    for field in profile_fields:
        if field in updates:
            setattr(profile, field, updates[field])

    db.commit()
    db.refresh(user)
    db.refresh(profile)
    return get_basic_profile(db, user)


def get_ai_profile(db: Session, user: User) -> AIProfileRead:
    profile = _get_or_create_profile(db, user)
    return AIProfileRead.model_validate(profile)


def update_ai_profile(db: Session, user: User, data: AIProfileUpdate) -> AIProfileRead:
    profile = _get_or_create_profile(db, user)
    updates = data.model_dump(exclude_unset=True)

    changed = False
    for field, value in updates.items():
        if getattr(profile, field) != value:
            setattr(profile, field, value)
            changed = True

    if changed:
        profile.profile_version += 1

    db.commit()
    db.refresh(profile)
    return AIProfileRead.model_validate(profile)


def get_account_overview(db: Session, user: User) -> AccountOverviewRead:
    retry_after_seconds = 0
    if not user.email_verified:
        retry_after_seconds = get_email_verification_retry_after_seconds(db, user)

    return AccountOverviewRead.model_validate(
        {
            "user_id": user.id,
            "email": user.email,
            "auth_provider": user.auth_provider,
            "email_verified": user.email_verified,
            "verification_email_retry_after_seconds": retry_after_seconds,
            "subscription_plan": user.subscription_plan,
            "member_since": user.created_at,
            "last_password_changed_at": user.last_password_changed_at,
        }
    )


def clear_chat_history(db: Session, user: User) -> ChatHistoryClearResult:
    sessions = list(db.scalars(select(ChatSession).where(ChatSession.user_id == user.id)))
    if not sessions:
        return ChatHistoryClearResult(deleted_sessions=0, deleted_messages=0)

    session_ids = [session.id for session in sessions]
    deleted_messages = len(
        list(db.scalars(select(ChatMessage).where(ChatMessage.session_id.in_(session_ids))))
    )

    for session in sessions:
        db.delete(session)
    db.commit()
    return ChatHistoryClearResult(deleted_sessions=len(sessions), deleted_messages=deleted_messages)


def export_account_data(db: Session, user: User) -> AccountDataExportRead:
    profile = _get_or_create_profile(db, user)

    goals = list(db.scalars(select(Goal).where(Goal.user_id == user.id)))
    metrics = list(db.scalars(select(TrackedMetric).where(TrackedMetric.user_id == user.id)))
    memories = list(db.scalars(select(MemoryEntry).where(MemoryEntry.user_id == user.id)))
    journals = list(db.scalars(select(JournalEntry).where(JournalEntry.user_id == user.id)))
    notifications = list(db.scalars(select(Notification).where(Notification.user_id == user.id)))
    tasks = list(db.scalars(select(PlannedTask).where(PlannedTask.user_id == user.id)))
    reports = list(db.scalars(select(Report).where(Report.user_id == user.id)))
    if goals:
        goal_ids = [goal.id for goal in goals]
        milestones = list(db.scalars(select(Milestone).where(Milestone.goal_id.in_(goal_ids))))
    else:
        milestones = []

    if metrics:
        metric_ids = [metric.id for metric in metrics]
        activities = list(
            db.scalars(select(ActivityLog).where(ActivityLog.metric_id.in_(metric_ids)))
        )
    else:
        activities = []

    data = {
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "timezone": user.timezone,
            "subscription_plan": user.subscription_plan,
            "email_verified": user.email_verified,
            "auth_provider": user.auth_provider,
            "created_at": user.created_at.isoformat(),
            "updated_at": user.updated_at.isoformat(),
        },
        "profile": AIProfileRead.model_validate(profile).model_dump(),
        "counts": {
            "goals": len(goals),
            "milestones": len(milestones),
            "metrics": len(metrics),
            "activity_logs": len(activities),
            "memories": len(memories),
            "journal_entries": len(journals),
            "planned_tasks": len(tasks),
            "notifications": len(notifications),
            "reports": len(reports),
        },
    }
    return AccountDataExportRead(exported_at=datetime.now(timezone.utc), data=data)


def delete_account(db: Session, user: User, *, confirmation_text: str) -> None:
    if confirmation_text.strip().upper() != "DELETE":
        raise ConflictError("Confirmation text must be exactly DELETE")
    db.delete(user)
    db.commit()
