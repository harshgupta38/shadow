from enum import Enum, StrEnum
from typing import Callable

from app.llm.tools.context import ToolContext


async def create_task_proposals(context: ToolContext, arguments: dict) -> dict:
    from app.services.goals_service import get_goal_detail
    from app.services.milestones_service import get_milestone_detail
    from app.llm import get_llm_service

    milestone_id = arguments["milestone_id"]

    milestone = get_milestone_detail(context.db, context.current_user, milestone_id)
    goal = get_goal_detail(context.db, context.current_user, milestone.goal_id)

    goal_data = goal.model_dump(mode="json")
    milestone_data = milestone.model_dump(mode="json")

    llm_service = get_llm_service()
    result = await llm_service.generate_task_proposals(
        goal_data=goal_data,
        milestone_data=milestone_data,
        user_id=context.current_user.id,
    )

    context.action_data = {
        **(context.action_data or {}),
        "task_proposals": {
            "goal_id": milestone.goal_id,
            "milestone_id": milestone_id,
            "tasks": [t.model_dump(mode="json") for t in result.proposals.tasks],
        },
    }

    return {
        "status": "done",
        "message": (
            "Task proposals have been generated and are now attached to the assistant message. "
            "Tell the user they can review the proposed tasks below your response."
        ),
    }


def get_task_list(context: ToolContext, arguments: dict) -> dict:
    from app.services.tasks_service import get_list

    milestone_id = arguments["milestone_id"]
    tasks = get_list(context.db, context.current_user, milestone_id)
    return {"tasks": [t.model_dump(mode="json") for t in tasks]}


def get_task_detail(context: ToolContext, arguments: dict) -> dict:
    from app.services.tasks_service import get_task_detail

    task_id = arguments["task_id"]
    task = get_task_detail(context.db, context.current_user, task_id)
    return {"task": task.model_dump(mode="json")}


class TaskToolDefinitions(Enum):
    CREATE_TASK_PROPOSALS = {
        "type": "function",
        "function": {
            "name": "create_task_proposals",
            "description": (
                "Use this tool to generate a set of task proposals that break a milestone "
                "into concrete, actionable tasks. Call this when the user asks you to create, "
                "suggest, or plan tasks for a milestone. "
                "The proposals are returned to the user for review — they are not saved automatically."
            ),
            "strict": True,
            "parameters": {
                "type": "object",
                "properties": {
                    "milestone_id": {
                        "type": "integer",
                        "minimum": 1,
                        "description": "The ID of the milestone to generate task proposals for.",
                    },
                },
                "required": ["milestone_id"],
                "additionalProperties": False,
            },
        },
    }
    GET_TASK_LIST = {
        "type": "function",
        "function": {
            "name": "get_task_list",
            "description": (
                "Use this tool to retrieve the tasks that belong to a specific milestone. "
                "Do not rely on conversation memory for task data because tasks "
                "may change outside the conversation."
            ),
            "strict": True,
            "parameters": {
                "type": "object",
                "properties": {
                    "milestone_id": {
                        "type": "integer",
                        "minimum": 1,
                        "description": "The ID of the milestone whose tasks to retrieve.",
                    },
                },
                "required": ["milestone_id"],
                "additionalProperties": False,
            },
        },
    }
    GET_TASK_DETAIL = {
        "type": "function",
        "function": {
            "name": "get_task_detail",
            "description": (
                "Call this tool when you need detailed information about a specific task. "
                "Do not rely on conversation memory because task details may change outside the conversation."
            ),
            "strict": True,
            "parameters": {
                "type": "object",
                "properties": {
                    "task_id": {
                        "type": "integer",
                        "minimum": 1,
                        "description": "The unique identifier of the task to fetch.",
                    },
                },
                "required": ["task_id"],
                "additionalProperties": False,
            },
        },
    }


TASK_TOOL_DEFINITIONS: list[dict] = [t.value for t in TaskToolDefinitions]


class TaskToolsEnum(StrEnum):
    CREATE_TASK_PROPOSALS = "create_task_proposals"
    GET_TASK_LIST = "get_task_list"
    GET_TASK_DETAIL = "get_task_detail"


TASK_TOOLS: dict[str, Callable] = {
    TaskToolsEnum.CREATE_TASK_PROPOSALS: create_task_proposals,
    TaskToolsEnum.GET_TASK_LIST: get_task_list,
    TaskToolsEnum.GET_TASK_DETAIL: get_task_detail,
}
