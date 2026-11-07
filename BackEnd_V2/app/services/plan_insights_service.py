"""Read-only summaries of how someone is doing against their plan, for the assistants' tools.

The planner keeps one record per item per day. These helpers read those records the way the reports do, so what an assistant says
agrees with what the person sees on the Reports page: skipped days are excused, habits left out of reports stay out, and a day that is
not over yet is pending, not missed. Nothing here writes.
"""

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.habit import HabitDBM
from app.models.plan_record import DailyPlanRecordDBM
from app.models.schedule_task import ScheduledTaskDBM
from app.models.task import TaskDBM
from app.models.user import UserDBM
from app.schemas.reports import DayReport
from app.services import reports_service

SOURCE_TYPES = ("habit", "task", "schedule")


def classify(record: DailyPlanRecordDBM, today: date) -> str:
    """done, missed, pending (today's, still open) or skipped (excused). A past day left open reads as missed, as in the app."""
    if record.skipped:
        return "skipped"
    if record.status == "done":
        return "done"
    if record.status == "missed" or record.scheduled_date < today:
        return "missed"
    return "pending"


def records_between(
    db: Session,
    user_id: int,
    start: date,
    end: date,
    *,
    source_type: str | None = None,
    source_ids: list[int] | None = None,
    report_only: bool = True,
) -> list[DailyPlanRecordDBM]:
    """The person's plan records from start to end. `report_only` drops habits they chose to keep out of reports."""
    query = select(DailyPlanRecordDBM).where(
        DailyPlanRecordDBM.user_id == user_id,
        DailyPlanRecordDBM.scheduled_date >= start,
        DailyPlanRecordDBM.scheduled_date <= end,
        DailyPlanRecordDBM.source_type.in_(SOURCE_TYPES),
    )
    if source_type is not None:
        query = query.where(DailyPlanRecordDBM.source_type == source_type)
    if source_ids is not None:
        query = query.where(DailyPlanRecordDBM.source_id.in_(source_ids))
    records = list(db.scalars(query.order_by(DailyPlanRecordDBM.scheduled_date, DailyPlanRecordDBM.id)).all())
    if report_only and any(r.source_type == "habit" for r in records):
        opted_out = set(db.scalars(select(HabitDBM.id).where(HabitDBM.user_id == user_id, HabitDBM.include_in_report.is_(False))).all())
        records = [r for r in records if not (r.source_type == "habit" and r.source_id in opted_out)]
    return records


@dataclass
class Tally:
    source_type: str
    source_id: int | None
    title: str
    done: int = 0
    missed: int = 0
    pending: int = 0
    skipped: int = 0

    @property
    def planned(self) -> int:
        """Occurrences that are settled, so the ones a rate can be judged on."""
        return self.done + self.missed

    @property
    def rate(self) -> int | None:
        return round(self.done / self.planned * 100) if self.planned else None


def tally(records: list[DailyPlanRecordDBM], today: date, *, by_title: bool = False) -> list[Tally]:
    """Counts per item (a habit, a task, a scheduled task), titled as in its latest record. `by_title` counts items that share a type
    and a title as one, which is how the person sees a habit they deleted and made again."""
    by_item: dict[tuple, Tally] = {}
    for record in records:
        key = (record.source_type, record.title.strip().lower() if by_title or record.source_id is None else record.source_id)
        item = by_item.setdefault(key, Tally(record.source_type, record.source_id, record.title))
        item.title = record.title
        state = classify(record, today)
        setattr(item, state, getattr(item, state) + 1)
    return list(by_item.values())


def totals(records: list[DailyPlanRecordDBM], today: date) -> dict[str, int]:
    counts = {"done": 0, "missed": 0, "pending": 0, "skipped": 0}
    for record in records:
        counts[classify(record, today)] += 1
    return counts


def percent_text(done: int, planned: int) -> str:
    """'19/24 (79%)', or words when nothing has come due."""
    return f"{done}/{planned} ({round(done / planned * 100)}%)" if planned else "nothing due yet"


def daily_scores(db: Session, user: UserDBM, start: date, end: date) -> list[DayReport]:
    """The Reports page's score and counts for each day with a plan from start to end, oldest first."""
    days: list[DayReport] = []
    year, month = start.year, start.month
    while (year, month) <= (end.year, end.month):
        days.extend(d for d in reports_service.get_monthly_report(db, user, year, month).days if start <= d.date <= end)
        year, month = (year + 1, 1) if month == 12 else (year, month + 1)
    return days


def goal_ids_by_source(db: Session, user_id: int, pairs: Iterable[tuple[str | None, int | None]]) -> dict[tuple[str, int], int]:
    """Which goal each (source type, source id) pair, a habit, task or scheduled task, belongs to. Pairs without a goal are left out."""
    wanted: dict[str, set[int]] = {"habit": set(), "task": set(), "schedule": set()}
    for source_type, source_id in pairs:
        if source_id is not None and source_type in wanted:
            wanted[source_type].add(source_id)
    models = {"habit": HabitDBM, "task": TaskDBM, "schedule": ScheduledTaskDBM}
    found: dict[tuple[str, int], int] = {}
    for source_type, ids in wanted.items():
        if not ids:
            continue
        model = models[source_type]
        for source_id, goal_id in db.execute(select(model.id, model.goal_id).where(model.user_id == user_id, model.id.in_(ids))).all():
            if goal_id is not None:
                found[(source_type, source_id)] = goal_id
    return found
