from datetime import date
import time

from fastapi import HTTPException, status

from app.models.goal import Goal
from app.models.user import User
from app.schemas.goals import (
    GoalDetailResponse,
    GoalListItemResponse,
    GoalListStatusFilter,
    UnderstandGoalRequest,
    UnderstandGoalResponse,
)


def understand_goal(data: UnderstandGoalRequest) -> UnderstandGoalResponse:
    time.sleep(3)

    # return UnderstandGoalResponse(
    #     title=data.goal.strip(),
    #     summary=(
    #         "Structured goal brief generated from your inputs, with milestones and measurable outcomes."
    #     ),
    #     category="Personal Growth",
    #     motivation=data.why.strip(),
    #     success_definition=data.success.strip(),
    #     current_state=data.reality.strip(),
    #     challenges=[data.obstacles],
    #     strengths=[
    #         "Clear intent to improve",
    #         "Willingness to reflect on constraints",
    #         "Defined success criteria",
    #     ],
    #     target_date="2027-08-31",
    #     success_metrics=[
    #         "Follow weekly execution plan consistently",
    #         "Complete milestone deliverables",
    #         f"Meet success definition: {data.success.strip()}",
    #     ],
    #     insights=[
    #         "Consistency over time will matter more than short bursts of effort.",
    #         "Reducing the listed challenges early will accelerate progress.",
    #     ],
    # )

    return {
        "title": "Become a Full-Stack Developer",
        "summary": "Build the skills required to secure a full-stack software engineering role with a target salary of ₹15 LPA.",
        "category": "Career",
        "motivation": "Achieve financial freedom and work remotely.",
        "success_definition": "Receive and accept a full-time full-stack developer job offer.",
        "current_state": "Knows HTML and CSS but has no backend experience.",
        "challenges": [
            "No structured roadmap",
            "Inconsistent learning",
            "Limited backend knowledge",
        ],
        "strengths": [
            "Already has frontend fundamentals",
            "Highly motivated",
            "Has a clear career objective",
        ],
        "target_date": "2027-08-31",
        "success_metrics": [
            "Complete full-stack curriculum",
            "Build five portfolio projects",
            "Apply to at least 100 companies",
            "Receive one job offer",
        ],
        "insights": [
            "Consistency is likely to have a greater impact than study hours.",
            "A structured roadmap will significantly reduce uncertainty.",
        ],
    }


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
        progress_percent=goal.progress_percent,
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
    time.sleep(5)

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
        progress_percent=0,
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
    time.sleep(2)
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
            progress_percent=goal.progress_percent,
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
    time.sleep(2)
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
    time.sleep(2)
    
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

    db.delete(goal)
    db.commit()
