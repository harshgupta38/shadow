from datetime import date

from fastapi import HTTPException, status
from sqlalchemy import delete

from app.llm import RefineGoalFromLLM, get_llm_service, LLMError, LLMRequestError
from app.models.goal import GoalDBM
from app.models.milestone import MilestoneDBM
from app.models.task import TaskDBM
from app.models.user import UserDBM
from app.schemas.goals import (
    GoalDataResponse,
    GoalDataShortResponse,
    GoalListStatusFilter,
    RefineGoalRequest,
)


async def refine_goal(
    data: RefineGoalRequest,
    current_user: UserDBM,
) -> RefineGoalFromLLM:
    llm_service = get_llm_service()

    try:
        return await llm_service.refine_goal(data, user_id=current_user.id)
    except LLMError as exc:
        raise LLMRequestError(f"Goal refinement failed: {exc}") from exc


def _clean_list(values: list[str]) -> list[str]:
    return [item.strip() for item in values if item.strip()]


def _serialize_goal_detail(goal: GoalDBM) -> GoalDataResponse:
    return GoalDataResponse.model_validate(goal)


def save_goal(
    db,
    current_user: UserDBM,
    data: RefineGoalRequest,
) -> None:
    # time.sleep(5)

    goal = GoalDBM(
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


def get_goal_list(
    db,
    current_user: UserDBM,
    status: GoalListStatusFilter,
) -> list[GoalDataShortResponse]:
    # time.sleep(2)
    # raise RuntimeError("Forced test error in get_goal_list")

    query = db.query(GoalDBM).filter(GoalDBM.user_id == current_user.id)

    if status != "All":
        query = query.filter(GoalDBM.status == status)

    goals = query.order_by(GoalDBM.updated_at.desc()).all()

    return [
        GoalDataShortResponse(
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
    current_user: UserDBM,
    goal_id: int,
) -> GoalDataResponse:
    # time.sleep(2)
    # raise RuntimeError("Forced test error in get_goal_list")

    goal = (
        db.query(GoalDBM)
        .filter(GoalDBM.id == goal_id, GoalDBM.user_id == current_user.id)
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
    current_user: UserDBM,
    goal_id: int,
) -> None:
    # time.sleep(2)
    # raise RuntimeError("Forced test error in get_goal_list")

    goal = (
        db.query(GoalDBM)
        .filter(GoalDBM.id == goal_id, GoalDBM.user_id == current_user.id)
        .first()
    )

    if goal is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Goal not found.",
        )

    db.execute(delete(TaskDBM).where(TaskDBM.goal_id == goal.id))
    db.execute(delete(MilestoneDBM).where(MilestoneDBM.goal_id == goal.id))
    db.delete(goal)
    db.commit()


def update_goal(
    db,
    current_user: UserDBM,
    goal_id: int,
    data: RefineGoalRequest,
) -> GoalDataResponse:
    goal = (
        db.query(GoalDBM)
        .filter(GoalDBM.id == goal_id, GoalDBM.user_id == current_user.id)
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
