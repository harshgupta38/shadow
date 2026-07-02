"""Profile domain service: basic identity + structured AI profile."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.user import User
from app.models.user_profile import UserProfile
from app.schemas.profile import (
    AIProfileRead,
    AIProfileUpdate,
    BasicProfileRead,
    BasicProfileUpdate,
)


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
