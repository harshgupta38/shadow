import time

from app.schemas.goals import (
    UnderstandGoalRequest,
    UnderstandGoalResponse,
)


def understand_goal(data: UnderstandGoalRequest) -> UnderstandGoalResponse:
    time.sleep(5)

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
