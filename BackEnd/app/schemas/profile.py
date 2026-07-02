"""Schemas for Profile domain (identity + AI profile)."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel


class BasicProfileRead(ORMModel):
    user_id: int
    email: str
    name: str
    timezone: str
    member_since: datetime

    display_name: str | None
    profile_picture_url: str | None
    current_role: str | None
    current_goal: str | None
    phone_number: str | None
    short_bio: str | None


class BasicProfileUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    timezone: str | None = Field(default=None, min_length=1, max_length=64)
    display_name: str | None = Field(default=None, max_length=120)
    profile_picture_url: str | None = Field(default=None, max_length=512)
    current_role: str | None = Field(default=None, max_length=160)
    current_goal: str | None = Field(default=None, max_length=255)
    phone_number: str | None = Field(default=None, max_length=40)
    short_bio: str | None = Field(default=None, max_length=500)


class AIProfileRead(ORMModel):
    profession: str | None
    industry: str | None
    experience_summary: str | None
    primary_tech_stack: str | None
    current_company: str | None
    dream_company: str | None
    interview_preparation_status: str | None

    long_term_vision: str | None
    current_goals_overview: str | None
    daily_routine: str | None
    working_style: str | None
    learning_profile: str | None
    productivity_preferences: str | None
    motivation: str | None
    always_remember: str | None

    profile_version: int
    updated_at: datetime


class AIProfileUpdate(BaseModel):
    profession: str | None = Field(default=None, max_length=160)
    industry: str | None = Field(default=None, max_length=120)
    experience_summary: str | None = None
    primary_tech_stack: str | None = None
    current_company: str | None = Field(default=None, max_length=160)
    dream_company: str | None = Field(default=None, max_length=160)
    interview_preparation_status: str | None = Field(default=None, max_length=160)

    long_term_vision: str | None = None
    current_goals_overview: str | None = None
    daily_routine: str | None = None
    working_style: str | None = None
    learning_profile: str | None = None
    productivity_preferences: str | None = None
    motivation: str | None = None
    always_remember: str | None = None
