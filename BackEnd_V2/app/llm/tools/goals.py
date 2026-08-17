from typing import Callable, get_args

from app.schemas.goals import GoalListStatusFilter
from app.llm.tools.context import ToolContext


def get_current_goals(context: ToolContext, arguments: dict) -> dict:
    from app.services.goals_service import get_goal_list # prevent circular import

    status = arguments["status"]
    start_index = max(arguments.get("start_index", 0), 0)
    end_index = arguments.get("end_index")
    if end_index is not None:
        end_index = max(end_index, start_index)

    goals = get_goal_list(context.db, context.current_user, status)
    return {
        "goals": [
            goal.model_dump(mode="json")
            for goal in goals[start_index:end_index]
        ]
    }


GOAL_TOOL_DEFINITIONS: list[dict] = [
    {
        "type": "function",
        "function": {
            "name": "get_current_goals",
            "description": (
                "Use this tool when you need to know the user's goals. "
                "Do not rely on conversation memory for the goal list because "
                "goals may change outside the conversation."
            ),
            "strict": True,
            "parameters": {
                "type": "object",
                "properties": {
                    "status": {
                        "type": "string",
                        "enum": [*get_args(GoalListStatusFilter)],
                        "description": (
                            "Filter goals by status. Use 'Active' for goals the user is "
                            "currently working on, 'Paused' for goals on hold, 'Completed' "
                            "for finished goals, or 'All' to get every goal regardless of "
                            "status."
                        ),
                    },
                    "start_index": {
                        "type": "integer",
                        "default": 0,
                        "minimum": 0,
                        "description": (
                            "Zero-based starting index of the goals to return. "
                            "Defaults to 0 when omitted."
                        ),
                    },
                    "end_index": {
                        "type": "integer",
                        "minimum": 0,
                        "description": (
                            "Exclusive ending index of the goals to return. "
                            "For the first 5 goals, use 5; indexes 0 through 4 are returned. "
                            "When omitted, return through the end of the list."
                        ),
                    },
                },
                "required": ["status"],
                "additionalProperties": False,
            },
        },
    },
]

GOAL_TOOLS: dict[str, Callable[[ToolContext, dict], dict]] = {
    "get_current_goals": get_current_goals,
}
