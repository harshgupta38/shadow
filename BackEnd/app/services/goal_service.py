"""Goal & milestone business logic (progress auto-recomputed from milestones)."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.base import utcnow
from app.models.enums import GoalStatus, MilestoneStatus
from app.models.goal import Goal
from app.models.milestone import Milestone
from app.models.user import User
from app.schemas.goal import GoalCreate, GoalUpdate
from app.schemas.milestone import MilestoneCreate, MilestoneUpdate
from app.services.exceptions import NotFoundError
from app.services.utils import get_owned_or_404


# ── Goals ─────────────────────────────────────────────────────
def list_goals(db: Session, user: User, *, status: GoalStatus | None = None) -> list[Goal]:
    stmt = select(Goal).where(Goal.user_id == user.id)
    if status is not None:
        stmt = stmt.where(Goal.status == status)
    return list(db.scalars(stmt.order_by(Goal.created_at.desc())))


def create_goal(db: Session, user: User, data: GoalCreate) -> Goal:
    goal = Goal(
        user_id=user.id,
        title=data.title,
        description=data.description,
        category=data.category,
        target_date=data.target_date,
    )
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return goal


def get_goal(db: Session, user: User, goal_id: int) -> Goal:
    return get_owned_or_404(db, Goal, goal_id, user.id, name="Goal")


def update_goal(db: Session, user: User, goal_id: int, data: GoalUpdate) -> Goal:
    goal = get_goal(db, user, goal_id)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(goal, field, value)
    db.commit()
    db.refresh(goal)
    return goal


def delete_goal(db: Session, user: User, goal_id: int) -> None:
    goal = get_goal(db, user, goal_id)
    db.delete(goal)
    db.commit()


# ── Milestones ────────────────────────────────────────────────
def _get_milestone_owned(db: Session, user: User, milestone_id: int) -> Milestone:
    milestone = db.get(Milestone, milestone_id)
    if milestone is None:
        raise NotFoundError("Milestone not found")
    # Ownership flows through the parent goal.
    goal = db.get(Goal, milestone.goal_id)
    if goal is None or goal.user_id != user.id:
        raise NotFoundError("Milestone not found")
    return milestone


def recompute_progress(db: Session, goal_id: int) -> None:
    """Set goal.progress from milestone completion (no-op if none)."""
    milestones = list(db.scalars(select(Milestone).where(Milestone.goal_id == goal_id)))
    if not milestones:
        return
    done = sum(1 for m in milestones if m.status == MilestoneStatus.done)
    goal = db.get(Goal, goal_id)
    if goal is not None:
        goal.progress = round(done * 100 / len(milestones))
        db.commit()


def list_milestones(db: Session, user: User, goal_id: int) -> list[Milestone]:
    goal = get_goal(db, user, goal_id)
    return list(
        db.scalars(
            select(Milestone)
            .where(Milestone.goal_id == goal.id)
            .order_by(Milestone.order, Milestone.id)
        )
    )


def add_milestone(db: Session, user: User, goal_id: int, data: MilestoneCreate) -> Milestone:
    goal = get_goal(db, user, goal_id)
    milestone = Milestone(
        goal_id=goal.id,
        title=data.title,
        description=data.description,
        status=data.status,
        order=data.order,
        due_date=data.due_date,
    )
    db.add(milestone)
    db.commit()
    db.refresh(milestone)
    recompute_progress(db, goal.id)
    return milestone


def update_milestone(db: Session, user: User, milestone_id: int, data: MilestoneUpdate) -> Milestone:
    milestone = _get_milestone_owned(db, user, milestone_id)
    updates = data.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(milestone, field, value)
    # Keep completed_at in sync with status changes.
    if "status" in updates:
        if milestone.status == MilestoneStatus.done and milestone.completed_at is None:
            milestone.completed_at = utcnow()
        elif milestone.status != MilestoneStatus.done:
            milestone.completed_at = None
    db.commit()
    db.refresh(milestone)
    recompute_progress(db, milestone.goal_id)
    return milestone


def delete_milestone(db: Session, user: User, milestone_id: int) -> None:
    milestone = _get_milestone_owned(db, user, milestone_id)
    goal_id = milestone.goal_id
    db.delete(milestone)
    db.commit()
    recompute_progress(db, goal_id)
