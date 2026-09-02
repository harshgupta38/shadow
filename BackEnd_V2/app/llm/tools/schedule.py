from enum import Enum, StrEnum
from typing import Callable

from app.llm.tools.context import ToolContext


async def create_scheduled_task_proposal(context: ToolContext, arguments: dict) -> dict:
    from app.schemas.schedule import ScheduledTaskProposalLLMSchema

    proposal = ScheduledTaskProposalLLMSchema(
        title=arguments["title"],
        scheduled_date=arguments["scheduled_date"],
        priority=arguments.get("priority") or "medium",
        planner_type=arguments.get("planner_type") or "simple",
        planner_target=arguments.get("planner_target"),
        value_unit=arguments.get("value_unit"),
        preferred_time=arguments.get("preferred_time") or "flexible",
        specific_time=arguments.get("specific_time"),
        allow_snoozing=arguments.get("allow_snoozing") or False,
        snooze_limit=arguments.get("snooze_limit"),
        duration_minutes=arguments.get("duration_minutes"),
        note=arguments.get("note"),
        assistant_context=arguments.get("assistant_context") or "",
    )

    context.action_data = {
        **(context.action_data or {}),
        "scheduled_task_proposal": proposal.model_dump(mode="json"),
    }

    return {
        "status": "done",
        "title": proposal.title,
        "scheduled_date": proposal.scheduled_date,
        "instruction": (
            "The scheduled task proposal is now attached as an interactive card in the UI. "
            "In your response, briefly confirm what you've set up — mention the task title and date. "
            "Do NOT re-list all the fields, the card already shows them. "
            "Just invite the user to review the card, make any edits, and save it."
        ),
    }


def get_schedule_task_details(context: ToolContext, arguments: dict) -> dict:
    from app.services.schedule_service import get_task

    task_id = arguments["task_id"]
    is_yearly = arguments.get("is_yearly") or False
    task = get_task(context.db, context.current_user, task_id, is_yearly)
    return {"task": task.model_dump(mode="json")}


def get_schedule_task_list(context: ToolContext, arguments: dict) -> dict:
    from datetime import date
    from app.services.schedule_service import get_list

    today = date.today()
    year = arguments.get("year") or today.year
    month = arguments.get("month") or today.month
    tasks = get_list(context.db, context.current_user, year, month)
    return {"tasks": [t.model_dump(mode="json") for t in tasks]}


class ScheduleToolDefinitions(Enum):
    CREATE_SCHEDULED_TASK_PROPOSAL = {
        "type": "function",
        "function": {
            "name": "create_scheduled_task_proposal",
            "description": (
                "Use this tool to create a one-time scheduled task proposal after gathering "
                "the necessary details from the user in conversation. Call this only after you "
                "have the task title and a specific date. The proposal appears as an interactive "
                "card for the user to review and save — it is NOT saved automatically."
            ),
            "strict": True,
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {
                        "type": "string",
                        "description": "The title of the scheduled task.",
                    },
                    "scheduled_date": {
                        "type": "string",
                        "description": "The date for the task in ISO format (YYYY-MM-DD), e.g. '2026-09-15'.",
                    },
                    "priority": {
                        "anyOf": [
                            {"type": "string", "enum": ["highest", "high", "medium", "low", "lowest"]},
                            {"type": "null"},
                        ],
                        "description": "Task priority. Use 'medium' if the user did not specify.",
                    },
                    "planner_type": {
                        "anyOf": [
                            {"type": "string", "enum": ["simple", "metric"]},
                            {"type": "null"},
                        ],
                        "description": "Use 'metric' only when the user wants to track a numeric value. Default is 'simple'.",
                    },
                    "planner_target": {
                        "anyOf": [{"type": "integer", "minimum": 1}, {"type": "null"}],
                        "description": "The numeric target for metric tasks (e.g. 10 for '10 pages'). Null for simple tasks.",
                    },
                    "value_unit": {
                        "anyOf": [{"type": "string", "maxLength": 64}, {"type": "null"}],
                        "description": "Unit label for metric tasks (e.g. 'pages', 'km'). Null for simple tasks.",
                    },
                    "preferred_time": {
                        "anyOf": [
                            {"type": "string", "enum": ["flexible", "morning", "afternoon", "evening", "night", "custom"]},
                            {"type": "null"},
                        ],
                        "description": "Preferred time of day for the task. Defaults to 'flexible'.",
                    },
                    "specific_time": {
                        "anyOf": [{"type": "string", "maxLength": 10}, {"type": "null"}],
                        "description": "Specific time string (e.g. '09:30') only when preferred_time is 'custom'. Otherwise null.",
                    },
                    "allow_snoozing": {
                        "anyOf": [{"type": "boolean"}, {"type": "null"}],
                        "description": "Whether the task can be snoozed. Defaults to false.",
                    },
                    "snooze_limit": {
                        "anyOf": [{"type": "integer", "minimum": 1}, {"type": "null"}],
                        "description": "Max number of snoozes allowed if allow_snoozing is true. Otherwise null.",
                    },
                    "duration_minutes": {
                        "anyOf": [{"type": "integer", "minimum": 1}, {"type": "null"}],
                        "description": "Estimated duration in minutes. Null if not mentioned by the user.",
                    },
                    "note": {
                        "anyOf": [{"type": "string", "maxLength": 2000}, {"type": "null"}],
                        "description": "Optional note for the task.",
                    },
                    "assistant_context": {
                        "type": "string",
                        "description": "Brief internal note explaining why you are creating this task (e.g. 'User wants to schedule their annual health checkup for October 1st').",
                    },
                },
                "required": [
                    "title", "scheduled_date", "priority", "planner_type", "planner_target",
                    "value_unit", "preferred_time", "specific_time", "allow_snoozing",
                    "snooze_limit", "duration_minutes", "note", "assistant_context",
                ],
                "additionalProperties": False,
            },
        },
    }
    GET_SCHEDULE_TASK_DETAILS = {
        "type": "function",
        "function": {
            "name": "get_schedule_task_details",
            "description": (
                "Use this tool to fetch the details of a single scheduled task by its ID. "
                "Prefer this over get_schedule_task_list when you already know the task ID."
            ),
            "strict": True,
            "parameters": {
                "type": "object",
                "properties": {
                    "task_id": {
                        "type": "integer",
                        "minimum": 1,
                        "description": "The ID of the scheduled task to fetch.",
                    },
                    "is_yearly": {
                        "anyOf": [{"type": "boolean"}, {"type": "null"}],
                        "description": "True if the task is a yearly recurring task. Defaults to false.",
                    },
                },
                "required": ["task_id", "is_yearly"],
                "additionalProperties": False,
            },
        },
    }
    GET_SCHEDULE_TASK_LIST = {
        "type": "function",
        "function": {
            "name": "get_schedule_task_list",
            "description": (
                "Use this tool to retrieve the user's scheduled tasks for a given month. "
                "Defaults to the current month if year/month are not provided. "
                "Do not rely on conversation memory for this data because tasks may change outside the conversation."
            ),
            "strict": True,
            "parameters": {
                "type": "object",
                "properties": {
                    "year": {
                        "anyOf": [{"type": "integer", "minimum": 2020, "maximum": 2220}, {"type": "null"}],
                        "description": "The year to fetch tasks for. Null defaults to the current year.",
                    },
                    "month": {
                        "anyOf": [{"type": "integer", "minimum": 1, "maximum": 12}, {"type": "null"}],
                        "description": "The month (1–12) to fetch tasks for. Null defaults to the current month.",
                    },
                },
                "required": ["year", "month"],
                "additionalProperties": False,
            },
        },
    }


SCHEDULE_TOOL_DEFINITIONS: list[dict] = [t.value for t in ScheduleToolDefinitions]


class ScheduleToolsEnum(StrEnum):
    CREATE_SCHEDULED_TASK_PROPOSAL = "create_scheduled_task_proposal"
    GET_SCHEDULE_TASK_DETAILS = "get_schedule_task_details"
    GET_SCHEDULE_TASK_LIST = "get_schedule_task_list"


SCHEDULE_TOOLS: dict[str, Callable] = {
    ScheduleToolsEnum.CREATE_SCHEDULED_TASK_PROPOSAL: create_scheduled_task_proposal,
    ScheduleToolsEnum.GET_SCHEDULE_TASK_DETAILS: get_schedule_task_details,
    ScheduleToolsEnum.GET_SCHEDULE_TASK_LIST: get_schedule_task_list,
}
