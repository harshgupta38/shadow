"""Enumerations shared by ORM models and Pydantic schemas (DRY)."""

from __future__ import annotations

import enum


class ThemePreference(str, enum.Enum):
    light = "light"
    dark = "dark"


class AIResponseLength(str, enum.Enum):
    short = "short"
    balanced = "balanced"
    detailed = "detailed"
    very_detailed = "very_detailed"


class AIPersonality(str, enum.Enum):
    professional = "professional"
    friendly = "friendly"
    coach = "coach"
    teacher = "teacher"
    mentor = "mentor"
    minimal = "minimal"


class WeekStartsOn(str, enum.Enum):
    monday = "monday"
    sunday = "sunday"


class TimeFormat(str, enum.Enum):
    h12 = "12h"
    h24 = "24h"


class DateFormat(str, enum.Enum):
    dd_mm_yyyy = "dd/mm/yyyy"
    mm_dd_yyyy = "mm/dd/yyyy"
    yyyy_mm_dd = "yyyy-mm-dd"


class MemoryCategory(str, enum.Enum):
    daily = "daily"
    weekly = "weekly"
    monthly = "monthly"
    career = "career"
    life = "life"
    personality = "personality"
    other = "other"


class MemorySource(str, enum.Enum):
    onboarding = "onboarding"
    chat = "chat"
    manual = "manual"
    behavior = "behavior"


class GoalStatus(str, enum.Enum):
    active = "active"
    paused = "paused"
    completed = "completed"
    archived = "archived"


class MilestoneStatus(str, enum.Enum):
    todo = "todo"
    in_progress = "in_progress"
    done = "done"


class AgentType(str, enum.Enum):
    onboarding = "onboarding"
    goal_coach = "goal_coach"
    career_advisor = "career_advisor"
    daily_checkin = "daily_checkin"
    progress_analyst = "progress_analyst"
    general = "general"


class ChatRole(str, enum.Enum):
    user = "user"
    assistant = "assistant"
    system = "system"


class NotificationType(str, enum.Enum):
    reminder = "reminder"
    system = "system"
    agent = "agent"


class MetricUnit(str, enum.Enum):
    count = "count"
    minutes = "minutes"
    hours = "hours"
    custom = "custom"


class MetricType(str, enum.Enum):
    default = "default"
    custom = "custom"


class ActivitySource(str, enum.Enum):
    manual = "manual"
    integration = "integration"


class PlannedTaskStatus(str, enum.Enum):
    planned = "planned"
    done = "done"
    missed = "missed"


class ReportPeriod(str, enum.Enum):
    daily = "daily"
    weekly = "weekly"


class JournalMood(str, enum.Enum):
    great = "Great"
    good = "Good"
    okay = "Okay"
    low = "Low"
    rough = "Rough"
