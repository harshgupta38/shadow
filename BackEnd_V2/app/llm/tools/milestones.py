from datetime import date
from typing import Callable, get_args

from app.schemas.milestones import MilestoneCreateRequest, MilestoneStatus, MilestoneUpdateRequest
from app.llm.exceptions import LLMRequestError
from app.llm.tools.context import ToolContext


async def create_milestone_proposals(context: ToolContext, arguments: dict) -> dict:
    from app.services.goals_service import get_goal_detail  # prevent circular import
    from app.llm import get_llm_service

    goal_id = arguments["goal_id"]
    goal = get_goal_detail(context.db, context.current_user, goal_id)
    goal_data = goal.model_dump(mode="json")

    llm_service = get_llm_service()
    result = await llm_service.generate_milestone_proposals(
        goal_data=goal_data,
        user_id=context.current_user.id,
    )

    context.action_data = {
        **(context.action_data or {}),
        "milestone_proposals": {
            "goal_id": goal_id,
            "milestones": [m.model_dump(mode="json") for m in result.proposals.milestones],
        },
    }
    return {
        "status": "done",
        "message": (
            "Milestone proposals have been generated and are now attached to the assistant message. "
            "Tell the user they can review the proposed milestones below your response."
        ),
    }


def get_milestone_list(context: ToolContext, arguments: dict) -> dict:
    from app.services.milestones_service import get_milestone_list  # prevent circular import

    goal_id = arguments["goal_id"]
    status = arguments.get("status")

    milestones = get_milestone_list(context.db, context.current_user, goal_id, status)
    return {"milestones": [m.model_dump(mode="json") for m in milestones]}


def get_milestone_detail(context: ToolContext, arguments: dict) -> dict:
    from app.services.milestones_service import get_milestone_detail  # prevent circular import

    milestone_id = arguments["milestone_id"]
    milestone = get_milestone_detail(context.db, context.current_user, milestone_id)
    return {"milestone": milestone.model_dump(mode="json")}


def create_milestone(context: ToolContext, arguments: dict) -> dict:
    from app.services.milestones_service import save_milestone  # prevent circular import

    if arguments.get("confirmed") is not True:
        raise LLMRequestError("Milestone creation requires user confirmation.")

    data = MilestoneCreateRequest(
        goal_id=arguments["goal_id"],
        title=arguments["title"],
        reason=arguments["reason"],
        description=arguments.get("description"),
        estimated_duration_days=arguments.get("estimated_duration_days"),
        created_by="Assistant",
    )
    milestone = save_milestone(context.db, context.current_user, data)
    return {"milestone": milestone.model_dump(mode="json")}


def delete_milestone(context: ToolContext, arguments: dict) -> dict:
    from app.services.milestones_service import delete_milestone  # prevent circular import

    if arguments.get("confirmed") is not True:
        raise LLMRequestError("Milestone deletion requires user confirmation.")

    milestone_id = arguments["milestone_id"]
    delete_milestone(context.db, context.current_user, milestone_id)
    return {"deleted": True, "milestone_id": milestone_id}


def update_milestone(context: ToolContext, arguments: dict) -> dict:
    from app.services.milestones_service import update_milestone  # prevent circular import

    if arguments.get("confirmed") is not True:
        raise LLMRequestError("Milestone update requires user confirmation.")

    milestone_id = arguments["milestone_id"]

    kwargs: dict = {}
    for field in ["title", "description", "status", "reason", "estimated_duration_days"]:
        if field in arguments:
            kwargs[field] = arguments[field]

    target_date_str = arguments.get("target_date")
    if target_date_str is not None:
        try:
            kwargs["target_date"] = date.fromisoformat(target_date_str)
        except ValueError as exc:
            raise LLMRequestError("target_date must use YYYY-MM-DD format.") from exc
    elif "target_date" in arguments:
        kwargs["target_date"] = None

    data = MilestoneUpdateRequest(**kwargs)
    milestone = update_milestone(context.db, context.current_user, milestone_id, data)
    return {"milestone": milestone.model_dump(mode="json")}


MILESTONE_TOOL_DEFINITIONS: list[dict] = [
    {
        "type": "function",
        "function": {
            "name": "create_milestone_proposals",
            "description": (
                "Use this tool to generate a set of milestone proposals that break an existing goal "
                "into concrete, actionable steps. Call this when the user asks you to create, suggest, "
                "plan, or break down milestones for one of their goals. "
                "The proposals are returned to the user for review — they are not saved automatically. "
                "Call get_current_goals first if you need to look up the goal_id."
            ),
            "strict": True,
            "parameters": {
                "type": "object",
                "properties": {
                    "goal_id": {
                        "type": "integer",
                        "minimum": 1,
                        "description": "The ID of the goal to generate milestone proposals for.",
                    },
                },
                "required": ["goal_id"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "delete_milestone",
            "description": (
                "Use this tool to permanently delete a milestone. This action cannot be undone. "
                "Always tell the user which milestone you are about to delete and ask for explicit "
                "confirmation before proceeding. Set confirmed to true only after the user confirms."
            ),
            "strict": True,
            "parameters": {
                "type": "object",
                "properties": {
                    "milestone_id": {
                        "type": "integer",
                        "minimum": 1,
                        "description": "The unique identifier of the milestone to delete.",
                    },
                    "confirmed": {
                        "type": "boolean",
                        "description": "Set to true only after the user explicitly confirms deletion.",
                    },
                },
                "required": ["milestone_id", "confirmed"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_milestone_list",
            "description": (
                "Use this tool to retrieve the milestones that belong to a specific goal. "
                "Always provide the goal_id and status. Use null for status to return all milestones. "
                "Do not rely on conversation memory for milestone data because milestones "
                "may change outside the conversation."
            ),
            "strict": True,
            "parameters": {
                "type": "object",
                "properties": {
                    "goal_id": {
                        "type": "integer",
                        "minimum": 1,
                        "description": "The ID of the goal whose milestones to retrieve.",
                    },
                    "status": {
                        "type": ["string", "null"],
                        "enum": [*get_args(MilestoneStatus), None],
                        "description": (
                            "Filter milestones by status. Use 'Not Started' for milestones not yet begun, "
                            "'In Progress' for active milestones, 'Paused' for milestones on hold, "
                            "'Completed' for finished milestones, 'Cancelled' for abandoned ones, "
                            "or null to return all milestones regardless of status."
                        ),
                    },
                },
                "required": ["goal_id", "status"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_milestone_detail",
            "description": (
                "Call this tool when you need detailed information about a specific milestone. "
                "Do not rely on conversation memory because milestone details may change outside "
                "the conversation. The returned milestone includes id, goal_id, title, description, "
                "status, reason, estimated_duration_days, target_date, started_at, paused_at, "
                "completed_at, cancelled_at, position, created_by, total_tasks, and completed_tasks."
            ),
            "strict": True,
            "parameters": {
                "type": "object",
                "properties": {
                    "milestone_id": {
                        "type": "integer",
                        "minimum": 1,
                        "description": "The unique identifier of the milestone to fetch.",
                    },
                },
                "required": ["milestone_id"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_milestone",
            "description": (
                "Use this tool to create a new milestone under an existing goal. "
                "Call get_current_goals first if you need to look up the goal_id. "
                    "Always explain what milestone you are about to create and ask for user "
                    "confirmation. Set confirmed to true only after the user confirms."
            ),
            "strict": True,
            "parameters": {
                "type": "object",
                "properties": {
                    "goal_id": {
                        "type": "integer",
                        "minimum": 1,
                        "description": "The ID of the goal this milestone belongs to.",
                    },
                    "title": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 255,
                        "description": "A short, clear title for the milestone.",
                    },
                    "reason": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 2000,
                        "description": (
                            "Why this milestone is important for achieving the goal. "
                            "Be specific and motivating."
                        ),
                    },
                    "description": {
                        "type": ["string", "null"],
                        "maxLength": 4000,
                        "description": (
                            "Optional additional detail about what this milestone involves. "
                            "Use null if not needed."
                        ),
                    },
                    "estimated_duration_days": {
                        "type": ["integer", "null"],
                        "minimum": 1,
                        "description": (
                            "Estimated number of days to complete this milestone. "
                            "Use null if unknown."
                        ),
                    },
                    "confirmed": {
                        "type": "boolean",
                        "description": "Set to true only after the user explicitly confirms creation.",
                    },
                },
                "required": [
                    "goal_id",
                    "title",
                    "reason",
                    "description",
                    "estimated_duration_days",
                    "confirmed",
                ],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "update_milestone",
            "description": (
                "Use this tool to update an existing milestone. Only the fields you provide "
                    "will be changed; use null to clear nullable fields. "
                    "Always ask for user confirmation and set confirmed to true only after "
                    "the user explicitly confirms."
            ),
            "strict": True,
            "parameters": {
                "type": "object",
                "properties": {
                    "milestone_id": {
                        "type": "integer",
                        "minimum": 1,
                        "description": "The unique identifier of the milestone to update.",
                    },
                    "title": {
                        "type": ["string", "null"],
                        "minLength": 1,
                        "maxLength": 255,
                        "description": "New title. Use null to leave unchanged.",
                    },
                    "description": {
                        "type": ["string", "null"],
                        "maxLength": 4000,
                        "description": "New description. Use null to leave unchanged.",
                    },
                    "status": {
                        "type": ["string", "null"],
                        "enum": [*get_args(MilestoneStatus), None],
                        "description": (
                            "New status. Use 'Not Started', 'In Progress', 'Paused', "
                            "'Completed', or 'Cancelled'. Use null to leave unchanged."
                        ),
                    },
                    "reason": {
                        "type": ["string", "null"],
                        "minLength": 1,
                        "maxLength": 2000,
                        "description": "Updated reason. Use null to leave unchanged.",
                    },
                    "estimated_duration_days": {
                        "type": ["integer", "null"],
                        "minimum": 1,
                        "description": "Updated duration estimate in days. Use null to leave unchanged.",
                    },
                    "target_date": {
                        "type": ["string", "null"],
                        "format": "date",
                        "description": (
                            "New target date in YYYY-MM-DD format. Must be today or a future date. "
                            "Use null to clear the target date."
                        ),
                    },
                    "confirmed": {
                        "type": "boolean",
                        "description": "Set to true only after the user explicitly confirms the update.",
                    },
                },
                "required": [
                    "milestone_id",
                    "title",
                    "description",
                    "status",
                    "reason",
                    "estimated_duration_days",
                    "target_date",
                    "confirmed",
                ],
                "additionalProperties": False,
            },
        },
    },
]

MILESTONE_TOOLS: dict[str, Callable] = {
    "create_milestone_proposals": create_milestone_proposals,
    "get_milestone_list": get_milestone_list,
    "get_milestone_detail": get_milestone_detail,
    # "create_milestone": create_milestone,
    # "update_milestone": update_milestone,
    # "delete_milestone": delete_milestone,
}
