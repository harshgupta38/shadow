from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

MuscleId = Literal[
    "chest", "shoulders", "traps", "biceps", "triceps", "forearms", "abs", "obliques",
    "lats", "lower_back", "glutes", "quads", "hamstrings", "calves",
]
Equipment = Literal["bodyweight", "dumbbell", "barbell", "machine", "cable", "kettlebell", "band", "other"]
Level = Literal["beginner", "intermediate", "advanced"]
Goal = Literal["build_muscle", "lose_fat", "strength", "endurance", "general_fitness"]
Mechanic = Literal["compound", "isolation"]
ExerciseKind = Literal["strength", "cardio", "warmup"]
PlanSource = Literal["predefined", "custom"]
SessionStatus = Literal["in_progress", "completed"]
WeekStatus = Literal["done", "today", "upcoming", "missed", "rest"]


# ── Requests ──────────────────────────────────────────────────────────────────


class PlanExerciseInput(BaseModel):
    exercise_id: int = Field(gt=0)
    sets: int = Field(ge=1, le=20)
    reps: str = Field(min_length=1, max_length=20)
    rest_seconds: int = Field(ge=0, le=900)
    weight_kg: float | None = Field(default=None, ge=0, le=1000)
    note: str | None = Field(default=None, max_length=200)

    @field_validator("reps")
    @classmethod
    def _reps_not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Enter a rep target, such as 8-12.")
        return value

    @field_validator("note")
    @classmethod
    def _blank_note_is_none(cls, value: str | None) -> str | None:
        return (value or "").strip() or None


class PlanDayInput(BaseModel):
    weekday: int = Field(ge=0, le=6)
    name: str = Field(min_length=1, max_length=60)
    exercises: list[PlanExerciseInput] = Field(min_length=1, max_length=40)

    @field_validator("name")
    @classmethod
    def _name_not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Give each training day a name.")
        return value


class WorkoutPlanSaveRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=500)
    goal: Goal
    level: Level
    days: list[PlanDayInput] = Field(min_length=1, max_length=7)

    @field_validator("name")
    @classmethod
    def _name_not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Give your plan a name.")
        return value

    @field_validator("description")
    @classmethod
    def _strip_description(cls, value: str) -> str:
        return value.strip()

    @field_validator("days")
    @classmethod
    def _one_session_per_weekday(cls, days: list[PlanDayInput]) -> list[PlanDayInput]:
        weekdays = [day.weekday for day in days]
        if len(set(weekdays)) != len(weekdays):
            raise ValueError("Each weekday can only have one training day.")
        return days


class SessionStartRequest(BaseModel):
    plan_day_id: int | None = Field(default=None, gt=0)  # None starts an empty, freestyle workout
    name: str | None = Field(default=None, max_length=80)


class SessionSetInput(BaseModel):
    reps: int | None = Field(default=None, ge=0, le=1000)
    weight_kg: float | None = Field(default=None, ge=0, le=1000)
    done: bool = False


class SessionExerciseInput(BaseModel):
    id: int | None = None  # None for an exercise added during the workout and not saved yet
    exercise_id: int = Field(gt=0)
    sets: list[SessionSetInput] = Field(default_factory=list, max_length=30)
    note: str | None = Field(default=None, max_length=200)


class SessionSaveRequest(BaseModel):
    note: str | None = Field(default=None, max_length=500)
    exercises: list[SessionExerciseInput] = Field(default_factory=list, max_length=40)


# ── Exercise library ──────────────────────────────────────────────────────────


class ExerciseSummaryResponse(BaseModel):
    id: int
    name: str
    image_url: str | None
    primary_muscles: list[MuscleId]
    secondary_muscles: list[MuscleId]
    equipment: Equipment
    level: Level
    mechanic: Mechanic
    kind: ExerciseKind
    default_sets: int
    default_reps: str
    default_rest_seconds: int


class ExercisePerformanceResponse(BaseModel):
    date: date
    weight_kg: float | None
    reps: int | None
    sets: int


class ExerciseDetailResponse(ExerciseSummaryResponse):
    description: str
    image_urls: list[str]
    instructions: list[str]
    tips: list[str]
    common_mistakes: list[str]
    last_performance: ExercisePerformanceResponse | None
    warm_up_with: list[ExerciseSummaryResponse]
    good_warm_up_for: list[ExerciseSummaryResponse]


# ── Plans ─────────────────────────────────────────────────────────────────────


class PlanExerciseResponse(BaseModel):
    id: int
    exercise: ExerciseSummaryResponse
    sets: int
    reps: str
    rest_seconds: int
    weight_kg: float | None
    note: str | None


class PlanDayResponse(BaseModel):
    id: int
    weekday: int
    name: str
    estimated_minutes: int
    exercises: list[PlanExerciseResponse]


class WorkoutPlanSummaryResponse(BaseModel):
    id: int
    name: str
    description: str
    goal: Goal
    level: Level
    source: PlanSource
    is_active: bool
    days_per_week: int
    weekdays: list[int]
    avg_minutes: int
    muscles: list[MuscleId]
    equipment: list[Equipment]
    cover_image_url: str | None  # reserved for custom covers; nothing sets it yet


class WorkoutPlanDetailResponse(WorkoutPlanSummaryResponse):
    days: list[PlanDayResponse]


# ── Sessions ──────────────────────────────────────────────────────────────────


class SessionSetResponse(BaseModel):
    reps: int | None
    weight_kg: float | None
    done: bool


class SessionExerciseResponse(BaseModel):
    id: int
    exercise: ExerciseSummaryResponse
    target_sets: int
    target_reps: str
    rest_seconds: int
    note: str | None
    sets: list[SessionSetResponse]
    previous_sets: list[SessionSetResponse]


class WorkoutSessionSummaryResponse(BaseModel):
    id: int
    name: str
    date: date
    status: SessionStatus
    plan_name: str | None
    duration_seconds: int
    exercise_count: int
    sets_done: int
    volume_kg: float
    muscles: list[MuscleId]


class WorkoutSessionDetailResponse(WorkoutSessionSummaryResponse):
    plan_id: int | None
    plan_day_id: int | None
    started_at: datetime
    finished_at: datetime | None
    note: str | None
    exercises: list[SessionExerciseResponse]


# ── Overview, progress and records ────────────────────────────────────────────


class WorkoutWeekDayResponse(BaseModel):
    date: date
    weekday: int
    label: str | None
    status: WeekStatus


class MuscleSetsResponse(BaseModel):
    muscle: MuscleId
    sets: float


class WorkoutOverviewResponse(BaseModel):
    active_plan: WorkoutPlanSummaryResponse | None
    today_date: date
    today_plan_day: PlanDayResponse | None
    is_rest_day: bool
    in_progress_session_id: int | None
    completed_today: WorkoutSessionSummaryResponse | None
    week: list[WorkoutWeekDayResponse]
    sessions_this_week: int
    sessions_target: int
    volume_kg_week: float
    minutes_week: int
    muscles_this_week: list[MuscleSetsResponse]


class WorkoutProgressWeekResponse(BaseModel):
    week_start: date
    sessions: int
    volume_kg: float
    minutes: int


class PersonalRecordResponse(BaseModel):
    exercise: ExerciseSummaryResponse
    weight_kg: float
    reps: int
    date: date


class WorkoutProgressResponse(BaseModel):
    weeks: list[WorkoutProgressWeekResponse]
    muscles: list[MuscleSetsResponse]
    personal_records: list[PersonalRecordResponse]
    total_sessions: int
    current_streak_weeks: int
