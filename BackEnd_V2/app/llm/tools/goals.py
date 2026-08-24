from enum import Enum, StrEnum
from typing import Callable, get_args

from app.schemas.goals import GoalListStatusFilter
from app.llm.tools.context import ToolContext


async def tool_refine_goal(context: ToolContext, arguments: dict) -> dict:
    from app.services.goals_service import refine_goal  # prevent circular import
    from app.schemas.goals import RefineGoalRequest

    data = RefineGoalRequest(
        goal=arguments["goal"],
        why=arguments["why"],
        success=arguments["success"],
        reality=arguments["reality"],
        obstacles=arguments["obstacles"],
    )

    result = await refine_goal(data, context.current_user)

    context.action_data = {
        "refined_goal": result.refined_data.model_dump(mode="json"),
        # "extra": result.model_dump(mode="json", exclude={"refined_data"}),
    }
    return {
        "status": "done",
        "message": (
            "The goal has been refined and is now displayed in the goal review panel. "
            "Tell the user they can review all the details there before saving. "
            "Let them know they can come back to this conversation if they want any changes made."
        ),
    }


def get_current_goals(context: ToolContext, arguments: dict) -> dict:
    from app.services.goals_service import get_goal_list  # prevent circular import

    status = arguments["status"]
    start_index = max(arguments.get("start_index") or 0, 0)
    end_index = arguments.get("end_index")

    if end_index is not None:
        end_index = max(end_index, start_index)

    goals = get_goal_list(context.db, context.current_user, status)
    return {
        "goals": [goal.model_dump(mode="json") for goal in goals[start_index:end_index]]
    }


def get_goal_detail(context: ToolContext, arguments: dict) -> dict:
    from app.services.goals_service import (
        get_goal_detail,
        get_goal_list,
    )  # prevent circular import

    name = arguments.get("goal_name", None)
    goal_id = arguments.get("goal_id", None)

    if goal_id is None and name is None:
        raise ValueError("Either goal_id or goal_name must be provided.")

    if goal_id is not None:
        goal = get_goal_detail(context.db, context.current_user, goal_id)
        return {"goal": goal.model_dump(mode="json")}
    else:
        goals = get_goal_list(context.db, context.current_user, "All")
        goal = next((g for g in goals if g.title.lower() == name.lower()), None)
        if goal is None:
            raise ValueError(f"Goal with name '{name}' not found.")
        goal = get_goal_detail(context.db, context.current_user, goal.id)
        return {"goal": goal.model_dump(mode="json")}


class GoalToolDefinitions(Enum):
    REFINE_GOAL = {
        "type": "function",
        "function": {
            "name": "tool_refine_goal",
            "description": (
                "Use this tool to generate a structured goal after you have discussed it with the user "
                "and collected answers to all five discovery questions. "
                "Before calling this tool, you must have asked and received answers to: "
                "(1) what they want to achieve, "
                "(2) why it matters to them, "
                "(3) how they define success, "
                "(4) their current situation, and "
                "(5) the main obstacle blocking them. "
                "This tool returns the refined goal data for the user to review and save — it does not save the goal itself."
            ),
            "strict": True,
            "parameters": {
                "type": "object",
                "properties": {
                    "goal": {
                        "type": "string",
                        "description": "What the user wants to achieve, in their own words.",
                    },
                    "why": {
                        "type": "string",
                        "description": "Why this goal is important to the user.",
                    },
                    "success": {
                        "type": "string",
                        "description": "How the user defines success for this goal.",
                    },
                    "reality": {
                        "type": "string",
                        "description": "The user's current situation related to the goal.",
                    },
                    "obstacles": {
                        "type": "string",
                        "description": "The main blocker or challenge currently stopping progress.",
                    },
                },
                "required": ["goal", "why", "success", "reality", "obstacles"],
                "additionalProperties": False,
            },
        },
    }
    GET_CURRENT_GOALS = {
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
                        "type": ["integer", "null"],
                        "minimum": 0,
                        "description": (
                            "Zero-based starting index of the goals to return. "
                            "Use null to start from the beginning."
                        ),
                    },
                    "end_index": {
                        "type": ["integer", "null"],
                        "minimum": 0,
                        "description": (
                            "Exclusive ending index of the goals to return. "
                            "For the first 5 goals, use 5; indexes 0 through 4 are returned. "
                            "Use null to return through the end of the list."
                        ),
                    },
                },
                "required": ["status", "start_index", "end_index"],
                "additionalProperties": False,
            },
        },
    }
    GET_GOAL_DETAIL = {
        "type": "function",
        "function": {
            "name": "get_goal_detail",
            "description": (
                "Call this tool whenever the user asks for detailed information about a "
                "specific goal. Identify the goal using either its goal_id or goal_name; "
                "provide one identifier, not both. Do not rely on conversation memory "
                "because goal details may change outside the conversation. The returned "
                "goal details include id, title, summary, category, status, target date, "
                "motivation, success definition, current state, challenges, strengths, "
                "success metrics, insights, milestones_total, milestones_completed, "
                "habits_total, and habits_active."
            ),
            "strict": True,
            "parameters": {
                "type": "object",
                "properties": {
                    "goal_id": {
                        "type": ["integer", "null"],
                        "description": (
                            "Fetch the goal details using this unique identifier. Use null if you are identifying the goal by name instead."
                        ),
                    },
                    "goal_name": {
                        "type": ["string", "null"],
                        "description": (
                            "Fetch the goal details using this name. Use null if you are identifying the goal by id instead."
                        ),
                    },
                },
                "required": ["goal_id", "goal_name"],
                "additionalProperties": False,
            },
        },
    }


GOAL_TOOL_DEFINITIONS: list[dict] = [t.value for t in GoalToolDefinitions]


class GoalToolsEnum(StrEnum):
    REFINE_GOAL = "tool_refine_goal"
    GET_CURRENT_GOALS = "get_current_goals"
    GET_GOAL_DETAIL = "get_goal_detail"


GOAL_TOOLS: dict[str, Callable] = {
    GoalToolsEnum.REFINE_GOAL: tool_refine_goal,
    GoalToolsEnum.GET_CURRENT_GOALS: get_current_goals,
    GoalToolsEnum.GET_GOAL_DETAIL: get_goal_detail,
}
