from datetime import date

from sqlalchemy import delete, update

from app.core.exceptions import NotFoundError, ConflictError
from app.llm import RefineGoalFromLLM, get_llm_service, LLMError, LLMRequestError
from app.models.chat import MessageDBM
from app.models.goal import GoalDBM
from app.models.goal_proposal import GoalProposalDBM
from app.models.milestone import MilestoneDBM
from app.models.task import TaskDBM
from app.models.user import UserDBM
from app.schemas.goals import (
    GoalDataResponse,
    GoalDataShortResponse,
    GoalListStatusFilter,
    RefineGoalRequest,
    SaveGoalFromProposalRequest,
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


def _find_goal(db, current_user: UserDBM, goal_id: int | None) -> GoalDBM | None:
    if goal_id is None:
        return None

    return (
        db.query(GoalDBM)
        .filter(GoalDBM.id == goal_id, GoalDBM.user_id == current_user.id)
        .first()
    )


def _mark_proposal_saved_in_message(
    db,
    message_id: int,
    proposal_id: str,
    goal_id: int,
) -> None:
    message = db.get(MessageDBM, message_id)
    if message is None:
        return

    linked_items = message.linked_items or {}
    proposals = linked_items.get("goal_proposals") or []
    updated_proposals = [
        (
            {**proposal, "status": "saved", "goal_id": goal_id}
            if proposal.get("proposal_id") == proposal_id
            else proposal
        )
        for proposal in proposals
    ]
    message.linked_items = {**linked_items, "goal_proposals": updated_proposals}


def save_goal_from_proposal(
    db,
    current_user: UserDBM,
    data: SaveGoalFromProposalRequest,
) -> GoalDataResponse:
    proposal = (
        db.query(GoalProposalDBM)
        .filter(GoalProposalDBM.proposal_id == data.proposal_id)
        .first()
    )

    if proposal is None or proposal.user_id != current_user.id:
        raise NotFoundError("Goal proposal not found.")

    # If the proposal already references a goal that still exists, this is an
    # idempotent replay of the save request: return that goal as-is.
    existing_goal = _find_goal(db, current_user, proposal.goal_id)
    if existing_goal is not None:
        return _serialize_goal_detail(existing_goal)

    # Either the proposal was never saved, or its goal was deleted since.
    # Either way we (re)create a goal for it, guarding against a concurrent
    # request doing the same by only transitioning if goal_id is unchanged.
    stale_goal_id = proposal.goal_id

    goal_data = data.goal
    goal = GoalDBM(
        user_id=current_user.id,
        title=goal_data.title.strip(),
        summary=goal_data.summary.strip(),
        category=goal_data.category,
        status="Active",
        motivation=goal_data.motivation.strip(),
        success_definition=goal_data.success_definition.strip(),
        current_state=goal_data.current_state.strip(),
        challenges=_clean_list(goal_data.challenges),
        strengths=_clean_list(goal_data.strengths),
        success_metrics=_clean_list(goal_data.success_metrics),
        insights=_clean_list(goal_data.insights),
        target_date=date.fromisoformat(goal_data.target_date),
        milestones_total=0,
        milestones_completed=0,
        habits_total=0,
        habits_active=0,
        source_conversation_id=proposal.conversation_id
    )
    db.add(goal)
    db.flush()

    # Atomic conditional transition guards against two concurrent requests
    # both creating a goal for the same proposal.
    result = db.execute(
        update(GoalProposalDBM)
        .where(
            GoalProposalDBM.proposal_id == data.proposal_id,
            GoalProposalDBM.goal_id == stale_goal_id,
        )
        .values(status="saved", goal_id=goal.id)
    )

    if result.rowcount == 0:
        db.rollback()
        proposal = (
            db.query(GoalProposalDBM)
            .filter(GoalProposalDBM.proposal_id == data.proposal_id)
            .first()
        )
        existing_goal = _find_goal(db, current_user, proposal.goal_id if proposal else None)
        if existing_goal is None:
            raise ConflictError("Goal proposal could not be resolved.")
        return _serialize_goal_detail(existing_goal)

    _mark_proposal_saved_in_message(db, proposal.message_id, data.proposal_id, goal.id)

    db.commit()
    db.refresh(goal)

    return _serialize_goal_detail(goal)


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
        raise NotFoundError("Goal not found.")

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
        raise NotFoundError("Goal not found.")

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
        raise NotFoundError("Goal not found.")

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
