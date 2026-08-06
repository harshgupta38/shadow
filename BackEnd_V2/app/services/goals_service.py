import time

from app.schemas.goals import (
    Milestone,
    UnderstandGoalRequest,
    UnderstandGoalResponse,
)


def understand_goal(data: UnderstandGoalRequest) -> UnderstandGoalResponse:
    time.sleep(5)

    milestones = [
        Milestone(
            title="Foundation",
            description="Build core concepts and close obvious knowledge gaps.",
        ),
        Milestone(
            title="Execution",
            description="Apply learning through practical project work.",
        ),
        Milestone(
            title="Outcome",
            description="Validate readiness against real-world success criteria.",
        ),
    ]

    return UnderstandGoalResponse(
        title=data.goal.strip(),
        summary=(
            "Structured goal brief generated from your inputs, with milestones and measurable outcomes."
        ),
        category="Personal Growth",
        goal_type="Skill Goal",
        motivation=data.why.strip(),
        success_definition=data.success.strip(),
        current_state=data.reality.strip(),
        challenges=[data.obstacles],
        strengths=[
            "Clear intent to improve",
            "Willingness to reflect on constraints",
            "Defined success criteria",
        ],
        estimated_duration="8-12 months",
        difficulty="Medium",
        success_metrics=[
            "Follow weekly execution plan consistently",
            "Complete milestone deliverables",
            f"Meet success definition: {data.success.strip()}",
        ],
        milestones=milestones,
        insights=[
            "Consistency over time will matter more than short bursts of effort.",
            "Reducing the listed challenges early will accelerate progress.",
        ],
    )