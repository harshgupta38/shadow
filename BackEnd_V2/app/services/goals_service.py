from datetime import date

from fastapi import HTTPException, status
from sqlalchemy import delete

from app.llm.models import RefineGoalResponse
from app.llm.exceptions import LLMError
from app.llm.service import get_llm_service
from app.models.goal import Goal
from app.models.milestone import Milestone
from app.models.task import Task
from app.models.user import User
from app.schemas.goals import (
    GoalDetailResponse,
    GoalListItemResponse,
    GoalListStatusFilter,
    UnderstandGoalRequest,
    UnderstandGoalResponse,
)


async def understand_goal(
    data: UnderstandGoalRequest,
    current_user: User,
) -> RefineGoalResponse:
    llm_service = get_llm_service()

    try:
        return await llm_service.refine_goal(data, user_id=current_user.id)
    except LLMError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Goal refinement failed: {exc}",
        ) from exc


def _clean_list(values: list[str]) -> list[str]:
    return [item.strip() for item in values if item.strip()]


def _serialize_goal_detail(goal: Goal) -> GoalDetailResponse:
    return GoalDetailResponse(
        id=goal.id,
        title=goal.title,
        summary=goal.summary,
        category=goal.category,
        status=goal.status,
        motivation=goal.motivation,
        success_definition=goal.success_definition,
        current_state=goal.current_state,
        challenges=goal.challenges,
        strengths=goal.strengths,
        target_date=goal.target_date.isoformat(),
        success_metrics=goal.success_metrics,
        insights=goal.insights,
        milestones_total=goal.milestones_total,
        milestones_completed=goal.milestones_completed,
        habits_total=goal.habits_total,
        habits_active=goal.habits_active,
    )


def save_goal(
    db,
    current_user: User,
    data: UnderstandGoalResponse,
) -> UnderstandGoalResponse:
    # time.sleep(5)

    goal = Goal(
        user_id=current_user.id,
        title=data.title.strip(),
        summary=data.summary.strip(),
        category=data.category,
        status="Active",
        motivation=data.motivation.strip(),
        success_definition=data.success_definition.strip(),
        current_state=data.current_state.strip(),
        challenges=_clean_list(data.challenges),
        strengths=_clean_list(data.strengths),
        success_metrics=_clean_list(data.success_metrics),
        insights=_clean_list(data.insights),
        target_date=date.fromisoformat(data.target_date),
        milestones_total=0,
        milestones_completed=0,
        habits_total=0,
        habits_active=0,
    )

    db.add(goal)
    db.commit()
    db.refresh(goal)

    return UnderstandGoalResponse(
        title=goal.title,
        summary=goal.summary,
        category=goal.category,
        motivation=goal.motivation,
        success_definition=goal.success_definition,
        current_state=goal.current_state,
        challenges=goal.challenges,
        strengths=goal.strengths,
        target_date=goal.target_date.isoformat(),
        success_metrics=goal.success_metrics,
        insights=goal.insights,
    )


def get_goal_list(
    db,
    current_user: User,
    status: GoalListStatusFilter,
) -> list[GoalListItemResponse]:
    # time.sleep(2)
    # raise RuntimeError("Forced test error in get_goal_list")

    query = db.query(Goal).filter(Goal.user_id == current_user.id)

    if status != "All":
        query = query.filter(Goal.status == status)

    goals = query.order_by(Goal.updated_at.desc()).all()

    return [
        GoalListItemResponse(
            id=goal.id,
            title=goal.title,
            summary=goal.summary,
            category=goal.category,
            status=goal.status,
            target_date=goal.target_date.isoformat(),
            milestones_total=goal.milestones_total,
            milestones_completed=goal.milestones_completed,
            habits_total=goal.habits_total,
            habits_active=goal.habits_active,
        )
        for goal in goals
    ]


def get_goal_detail(
    db,
    current_user: User,
    goal_id: int,
) -> GoalDetailResponse:
    # time.sleep(2)
    # raise RuntimeError("Forced test error in get_goal_list")

    goal = (
        db.query(Goal)
        .filter(Goal.id == goal_id, Goal.user_id == current_user.id)
        .first()
    )

    if goal is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Goal not found.",
        )

    return _serialize_goal_detail(goal)


def delete_goal(
    db,
    current_user: User,
    goal_id: int,
) -> None:
    # time.sleep(2)
    # raise RuntimeError("Forced test error in get_goal_list")

    goal = (
        db.query(Goal)
        .filter(Goal.id == goal_id, Goal.user_id == current_user.id)
        .first()
    )

    if goal is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Goal not found.",
        )

    db.execute(delete(Task).where(Task.goal_id == goal.id))
    db.execute(delete(Milestone).where(Milestone.goal_id == goal.id))
    db.delete(goal)
    db.commit()


def update_goal(
    db,
    current_user: User,
    goal_id: int,
    data: UnderstandGoalResponse,
) -> GoalDetailResponse:
    goal = (
        db.query(Goal)
        .filter(Goal.id == goal_id, Goal.user_id == current_user.id)
        .first()
    )

    if goal is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Goal not found.",
        )

    goal.title = data.title.strip()
    goal.summary = data.summary.strip()
    goal.category = data.category
    goal.motivation = data.motivation.strip()
    goal.success_definition = data.success_definition.strip()
    goal.current_state = data.current_state.strip()
    goal.challenges = _clean_list(data.challenges)
    goal.strengths = _clean_list(data.strengths)
    goal.success_metrics = _clean_list(data.success_metrics)
    goal.insights = _clean_list(data.insights)
    goal.target_date = date.fromisoformat(data.target_date)

    db.commit()
    db.refresh(goal)

    return _serialize_goal_detail(goal)
