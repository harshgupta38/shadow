"""Profile service — assembles the single-endpoint payload for the Profile page.

Every card's data is a slice of one response (same approach as
dashboard_service — see that module's docstring). Name/email are
deliberately absent here; the frontend sources those from AuthContext
(UserDataResponse) instead of duplicating them.
"""

from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.common import to_ist, today_ist
from app.models.chat import ConversationDBM
from app.models.goal import GoalDBM
from app.models.habit import HabitDBM
from app.models.milestone import MilestoneDBM
from app.models.plan_record import DailyPlanRecordDBM
from app.models.report import ReportDBM
from app.models.schedule_task import ScheduledTaskDBM
from app.models.task import TaskDBM
from app.models.user import UserDBM
from app.schemas.profile import ProfileAchievement, ProfileResponse
from app.services import habits_service, report_service, reports_service

# ── System-wide achievement thresholds ─────────────────────────────────────────
_WEEK_STREAK_DAYS = 7
_MONTH_STREAK_DAYS = 30
_HABIT_BUILDER_MIN_ACTIVE = 5
_CENTURY_CLUB_TASKS = 100
_MILESTONE_MASTER_COUNT = 10
_GOAL_CRUSHER_COUNT = 5
_SCHEDULER_PRO_COUNT = 20
_CAREER_CLIMBER_CONVERSATIONS = 5
_AI_CONFIDANT_CONVERSATIONS = 25
_HABIT_VARIETY_CATEGORIES = 5
_ON_TARGET_ALIGNMENT_PERCENT = 75
_REFLECTION_PRO_REPORTS = 10
_CONSISTENCY_WINDOW_DAYS = 30
_CONSISTENCY_MIN_REPORTS = 20
_CONSISTENCY_MIN_AVG_ALIGNMENT = 90
_PLANNER_PRO_STREAK_DAYS = 14
_PLANNER_PRO_LOOKBACK_DAYS = 60
_EARLY_RISER_HOUR = 8
_EARLY_RISER_SCAN_LIMIT = 2000

# ── Personal achievement thresholds ─────────────────────────────────────────────
_PERSONAL_HABIT_STREAK_UNLOCK = 14
_PERSONAL_GOAL_TASKS_UNLOCK = 10
_PERSONAL_TILE_CAP = 20

# A habit only earns its own achievement tile if it's important enough:
# medium priority or above, and scheduled to occur more than once a week.
# Low-priority or once-a-month-ish habits (bill payments, one-off checks)
# just clutter the grid — see the frequency-rate estimate below.
_PERSONAL_HABIT_MIN_PRIORITY = {"highest", "high", "medium"}
_PERSONAL_HABIT_MIN_WEEKLY_RATE = 1  # strictly greater than this to qualify

# Matches planner_service._DAY_NAMES — duplicated locally rather than
# importing a private module constant (same reasoning as track_progress_
# service._color being duplicated instead of imported).
_WEEKDAY_NAMES = {"monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"}
_DAYS_PER_MONTH = 30.4  # average — good enough for a "does this even matter" filter

# Deterministic per-entity color rotation — must stay identical to
# track_progress_service._color() so the same habit shows the same accent
# color everywhere in the app.
_COLOR_KEYS = ["success", "info", "brand", "warn", "violet"]


def _color(entity_id: int) -> str:
    return _COLOR_KEYS[entity_id % len(_COLOR_KEYS)]


def _count(db: Session, model, *clauses) -> int:
    return db.scalar(select(func.count()).select_from(model).where(*clauses)) or 0


def _goals_completed(db: Session, user_id: int) -> int:
    return _count(db, GoalDBM, GoalDBM.user_id == user_id, GoalDBM.status == "Completed")


def _habits_active_count(db: Session, user_id: int) -> int:
    return _count(db, HabitDBM, HabitDBM.user_id == user_id, HabitDBM.status == "active")


def _tasks_completed_total(db: Session, user_id: int) -> int:
    return _count(db, TaskDBM, TaskDBM.user_id == user_id, TaskDBM.status == "Completed")


def _milestones_completed_count(db: Session, user_id: int) -> int:
    return _count(db, MilestoneDBM, MilestoneDBM.user_id == user_id, MilestoneDBM.status == "Completed")


def _scheduled_completed_count(db: Session, user_id: int) -> int:
    return _count(db, ScheduledTaskDBM, ScheduledTaskDBM.user_id == user_id, ScheduledTaskDBM.status == "completed")


def _conversation_count(db: Session, user_id: int, agent_type: str) -> int:
    return _count(db, ConversationDBM, ConversationDBM.user_id == user_id, ConversationDBM.agent_type == agent_type)


def _habit_category_variety(db: Session, user_id: int) -> int:
    return db.scalar(
        select(func.count(func.distinct(HabitDBM.category))).where(
            HabitDBM.user_id == user_id, HabitDBM.category.isnot(None)
        )
    ) or 0


def _has_early_completion(db: Session, user_id: int) -> bool:
    """"Complete a task before 8 AM" — scans done occurrences for one whose
    completion, converted to IST, lands before the early-riser hour."""
    rows = db.scalars(
        select(DailyPlanRecordDBM.completed_at)
        .where(
            DailyPlanRecordDBM.user_id == user_id,
            DailyPlanRecordDBM.status == "done",
            DailyPlanRecordDBM.completed_at.isnot(None),
        )
        .limit(_EARLY_RISER_SCAN_LIMIT)
    ).all()
    return any(to_ist(dt).hour < _EARLY_RISER_HOUR for dt in rows if dt is not None)


def _weekly_report_count(db: Session, user_id: int) -> int:
    # No "read" tracking exists on reports — generated is the closest proxy
    # available for "read 10 weekly reports".
    return _count(db, ReportDBM, ReportDBM.user_id == user_id, ReportDBM.report_type == "weekly")


def _consistency_king_unlocked(db: Session, user_id: int, today: date) -> bool:
    start = today - timedelta(days=_CONSISTENCY_WINDOW_DAYS)
    scores = db.scalars(
        select(ReportDBM.alignment_score).where(
            ReportDBM.user_id == user_id,
            ReportDBM.report_type == "daily",
            ReportDBM.report_date >= start,
            ReportDBM.report_date <= today,
            ReportDBM.alignment_score.isnot(None),
        )
    ).all()
    if len(scores) < _CONSISTENCY_MIN_REPORTS:
        return False
    return (sum(scores) / len(scores)) >= _CONSISTENCY_MIN_AVG_ALIGNMENT


def _full_completion_streak(db: Session, user_id: int, today: date) -> int:
    """Consecutive days ending today where every due habit/task/schedule
    occurrence was fully completed (metric occurrences need actual >= target).
    Same recency window as report_service.compute_streak, but requires the
    whole day clean rather than "at least one item done"."""
    start = today - timedelta(days=_PLANNER_PRO_LOOKBACK_DAYS)
    rows = db.execute(
        select(
            DailyPlanRecordDBM.scheduled_date,
            DailyPlanRecordDBM.status,
            DailyPlanRecordDBM.planner_type,
            DailyPlanRecordDBM.planner_target,
            DailyPlanRecordDBM.actual_value,
            DailyPlanRecordDBM.skipped,
        ).where(
            DailyPlanRecordDBM.user_id == user_id,
            DailyPlanRecordDBM.scheduled_date >= start,
            DailyPlanRecordDBM.scheduled_date <= today,
            DailyPlanRecordDBM.source_type.in_(["habit", "task", "schedule"]),
        )
    ).all()

    by_date: dict[date, list] = {}
    for row in rows:
        by_date.setdefault(row.scheduled_date, []).append(row)

    def _day_fully_done(records: list) -> bool:
        if not records:
            return False
        for r in records:
            if r.skipped:
                continue
            if r.planner_type == "metric" and r.planner_target:
                if (r.actual_value or 0) < r.planner_target:
                    return False
            elif r.status != "done":
                return False
        return True

    streak = 0
    check = today
    while _day_fully_done(by_date.get(check, [])):
        streak += 1
        check -= timedelta(days=1)
    return streak


def _system_achievements(
    db: Session,
    user_id: int,
    today: date,
    *,
    streak_days: int,
    goals_completed: int,
    habits_active: int,
    tasks_completed_total: int,
    month_alignment_percent: int,
) -> list[ProfileAchievement]:
    return [
        ProfileAchievement(
            key="first-goal", label="First Goal", hint="Completed your first goal",
            icon="Award", unlocked=goals_completed >= 1,
        ),
        ProfileAchievement(
            key="week-streak", label="7-Day Streak", hint="Stayed consistent for a week",
            icon="Fire", unlocked=streak_days >= _WEEK_STREAK_DAYS,
        ),
        ProfileAchievement(
            key="habit-builder", label="Habit Builder", hint="Tracking 5+ active habits",
            icon="SunriseFill", unlocked=habits_active >= _HABIT_BUILDER_MIN_ACTIVE,
        ),
        ProfileAchievement(
            key="century-club", label="Century Club", hint="Completed 100 tasks",
            icon="TrophyFill", unlocked=tasks_completed_total >= _CENTURY_CLUB_TASKS,
        ),
        ProfileAchievement(
            key="month-streak", label="30-Day Streak", hint="A full month, no gaps",
            icon="LightningChargeFill", unlocked=streak_days >= _MONTH_STREAK_DAYS,
        ),
        ProfileAchievement(
            key="early-riser", label="Early Riser", hint="Complete a task before 8 AM",
            icon="CupHotFill", unlocked=_has_early_completion(db, user_id),
        ),
        ProfileAchievement(
            key="reflection-pro", label="Reflection Pro", hint="Read 10 weekly reports",
            icon="JournalText", unlocked=_weekly_report_count(db, user_id) >= _REFLECTION_PRO_REPORTS,
        ),
        ProfileAchievement(
            key="consistency-king", label="Consistency King", hint="90%+ alignment for 30 days",
            icon="StarFill", unlocked=_consistency_king_unlocked(db, user_id, today),
        ),
        ProfileAchievement(
            key="milestone-master", label="Milestone Master", hint="Completed 10 milestones",
            icon="Diagram3", unlocked=_milestones_completed_count(db, user_id) >= _MILESTONE_MASTER_COUNT,
        ),
        ProfileAchievement(
            key="goal-crusher", label="Goal Crusher", hint="Completed 5 goals",
            icon="RocketTakeoffFill", unlocked=goals_completed >= _GOAL_CRUSHER_COUNT,
        ),
        ProfileAchievement(
            key="scheduler-pro", label="Scheduler Pro", hint="Completed 20 scheduled tasks",
            icon="CalendarEvent", unlocked=_scheduled_completed_count(db, user_id) >= _SCHEDULER_PRO_COUNT,
        ),
        ProfileAchievement(
            key="planner-pro", label="Planner Pro", hint="Followed Today's Plan 14 days straight",
            icon="ClipboardCheck",
            unlocked=_full_completion_streak(db, user_id, today) >= _PLANNER_PRO_STREAK_DAYS,
        ),
        ProfileAchievement(
            key="career-climber", label="Career Climber", hint="Chatted with the Career Advisor 5 times",
            icon="BriefcaseFill",
            unlocked=_conversation_count(db, user_id, "career_advisor") >= _CAREER_CLIMBER_CONVERSATIONS,
        ),
        ProfileAchievement(
            key="ai-confidant", label="AI Confidant", hint="Reached 25 conversations with Shadow",
            icon="ChatDotsFill",
            unlocked=_conversation_count(db, user_id, "shadow") >= _AI_CONFIDANT_CONVERSATIONS,
        ),
        ProfileAchievement(
            key="habit-variety", label="Habit Variety", hint="Built habits across 5 focus areas",
            icon="Grid3x3GapFill",
            unlocked=_habit_category_variety(db, user_id) >= _HABIT_VARIETY_CATEGORIES,
        ),
        ProfileAchievement(
            key="on-target", label="On Target", hint="Kept monthly alignment above 75%",
            icon="Bullseye", unlocked=month_alignment_percent >= _ON_TARGET_ALIGNMENT_PERCENT,
        ),
    ]


def _weekly_occurrence_rate(frequencies: list[str], weekly_count: int | None, monthly_count: int | None, specific_days: list[int] | None) -> float:
    """Rough estimate of how many times a habit occurs per week, from its
    scheduling fields — good enough to decide "is this worth an achievement
    tile", not a precise recurrence calculator (see planner_service._freq_matches
    for the real one)."""
    freqs = set(frequencies)

    if "daily" in freqs:
        return 7.0
    if "weekdays" in freqs:
        return 5.0
    if "weekends" in freqs:
        return 2.0

    named_days = freqs & _WEEKDAY_NAMES
    if named_days:
        return float(len(named_days))

    if "weekly" in freqs:
        return float(weekly_count or 1)
    if "monthly" in freqs:
        return (monthly_count or 1) * 7 / _DAYS_PER_MONTH
    if "specific_day" in freqs:
        return (len(specific_days or []) or 1) * 7 / _DAYS_PER_MONTH
    if "first_of_month" in freqs or "end_of_month" in freqs:
        return 7 / _DAYS_PER_MONTH

    return 1.0  # unrecognized/unset — treat as infrequent rather than assume


def _personal_habit_achievements(db: Session, current_user: UserDBM) -> list[ProfileAchievement]:
    habits = habits_service.get_list(db, current_user)
    habits = [
        h for h in habits
        if h.priority in _PERSONAL_HABIT_MIN_PRIORITY
        and _weekly_occurrence_rate(h.frequencies, h.weekly_count, h.monthly_count, h.specific_days) > _PERSONAL_HABIT_MIN_WEEKLY_RATE
    ]
    habits = sorted(habits, key=lambda h: h.current_streak, reverse=True)[:_PERSONAL_TILE_CAP]
    return [
        ProfileAchievement(
            key=f"habit-{h.id}",
            label=h.title,
            hint=f"{h.current_streak}-day streak",
            icon="Fire",
            unlocked=h.current_streak >= _PERSONAL_HABIT_STREAK_UNLOCK,
            tone=_color(h.id),
        )
        for h in habits
    ]


def _personal_goal_achievements(db: Session, user_id: int) -> list[ProfileAchievement]:
    goals = db.scalars(select(GoalDBM).where(GoalDBM.user_id == user_id)).all()
    if not goals:
        return []

    rows = db.execute(
        select(TaskDBM.goal_id, func.count())
        .where(TaskDBM.user_id == user_id, TaskDBM.status == "Completed")
        .group_by(TaskDBM.goal_id)
    ).all()
    completed_by_goal = {goal_id: count for goal_id, count in rows}

    goals = sorted(goals, key=lambda g: completed_by_goal.get(g.id, 0), reverse=True)[:_PERSONAL_TILE_CAP]
    return [
        ProfileAchievement(
            key=f"goal-{g.id}",
            label=g.title,
            hint=f"{completed_by_goal.get(g.id, 0)} tasks completed",
            icon="FlagFill",
            unlocked=completed_by_goal.get(g.id, 0) >= _PERSONAL_GOAL_TASKS_UNLOCK,
            tone="brand",
        )
        for g in goals
    ]


def _month_alignment_percent(month_days) -> int:
    weight_total = sum(d.habits_total + d.tasks_total + d.schedule_total for d in month_days)
    if weight_total == 0:
        return 0
    weighted_score = sum(
        (d.score / 100) * (d.habits_total + d.tasks_total + d.schedule_total)
        for d in month_days
        if d.score is not None
    )
    return round(weighted_score / weight_total * 100)


def _month_goal_totals(db: Session, user_id: int, today: date) -> tuple[int, int]:
    """"Goals" progress this month = goals due this month (target_date inside
    the current calendar month) vs. how many of those are already Completed."""
    month_start = today.replace(day=1)
    next_month_start = (month_start + timedelta(days=32)).replace(day=1)

    total = _count(
        db, GoalDBM,
        GoalDBM.user_id == user_id,
        GoalDBM.target_date >= month_start,
        GoalDBM.target_date < next_month_start,
    )
    done = _count(
        db, GoalDBM,
        GoalDBM.user_id == user_id,
        GoalDBM.target_date >= month_start,
        GoalDBM.target_date < next_month_start,
        GoalDBM.status == "Completed",
    )
    return done, total


def get_profile(db: Session, current_user: UserDBM) -> ProfileResponse:
    user_id = current_user.id
    today = today_ist()

    streak_days = report_service.compute_streak(db, user_id, today)
    goals_completed = _goals_completed(db, user_id)
    habits_active = _habits_active_count(db, user_id)
    tasks_completed_total = _tasks_completed_total(db, user_id)

    month_report = reports_service.get_monthly_report(db, current_user, today.year, today.month)
    month_habits_done = sum(d.habits_done for d in month_report.days)
    month_habits_total = sum(d.habits_total for d in month_report.days)
    month_tasks_done = sum(d.tasks_done for d in month_report.days)
    month_tasks_total = sum(d.tasks_total for d in month_report.days)
    month_alignment_percent = _month_alignment_percent(month_report.days)
    month_goals_done, month_goals_total = _month_goal_totals(db, user_id, today)

    achievements = _system_achievements(
        db, user_id, today,
        streak_days=streak_days,
        goals_completed=goals_completed,
        habits_active=habits_active,
        tasks_completed_total=tasks_completed_total,
        month_alignment_percent=month_alignment_percent,
    )
    achievements += _personal_habit_achievements(db, current_user)
    achievements += _personal_goal_achievements(db, user_id)

    return ProfileResponse(
        bio=current_user.bio,
        joined_at=current_user.created_at.date(),
        email_verified=current_user.email_verified,
        streak_days=streak_days,
        goals_completed=goals_completed,
        habits_active=habits_active,
        tasks_completed_total=tasks_completed_total,
        month_alignment_percent=month_alignment_percent,
        month_goals_done=month_goals_done,
        month_goals_total=month_goals_total,
        month_habits_done=month_habits_done,
        month_habits_total=month_habits_total,
        month_tasks_done=month_tasks_done,
        month_tasks_total=month_tasks_total,
        achievements=achievements,
    )


def update_bio(db: Session, current_user: UserDBM, bio: str) -> ProfileResponse:
    current_user.bio = bio or None
    db.commit()
    db.refresh(current_user)
    return get_profile(db, current_user)
