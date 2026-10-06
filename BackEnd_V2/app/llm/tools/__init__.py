from app.llm.exceptions import LLMUnknownToolError
from app.llm.tools.context import ToolContext
from app.llm.tools.goals import GOAL_TOOL_DEFINITIONS, GOAL_TOOLS, GoalToolDefinitions
from app.llm.tools.milestones import (
    MILESTONE_TOOL_DEFINITIONS,
    MILESTONE_TOOLS,
    MilestoneToolDefinitions,
)
from app.llm.tools.tasks import (
    TASK_TOOL_DEFINITIONS,
    TASK_TOOLS,
    TaskToolDefinitions,
)
from app.llm.tools.schedule import (
    SCHEDULE_TOOL_DEFINITIONS,
    SCHEDULE_TOOLS,
    ScheduleToolDefinitions,
)

MAX_TOOL_ITERATIONS = 3

# After these tools run, no re-query is needed — the final structured parse handles the response.
TERMINAL_TOOL_NAMES: frozenset[str] = frozenset({
    "create_goal_proposal",                # writes refined goal to context.action_data; UI renders it
    "create_milestone_proposals",          # writes proposals to context.action_data; UI renders them
    "create_task_proposals",               # writes proposals to context.action_data; UI renders them
    "create_scheduled_task_proposal",      # writes proposal to context.action_data; UI renders it
})

ALL_TOOL_DEFINITIONS: list[dict] = [
    *GOAL_TOOL_DEFINITIONS,
    *MILESTONE_TOOL_DEFINITIONS,
    *TASK_TOOL_DEFINITIONS,
    *SCHEDULE_TOOL_DEFINITIONS,
]

GOAL_COACH_TOOL_DEFINITIONS: list[dict] = [
    GoalToolDefinitions.REFINE_GOAL.value,
    GoalToolDefinitions.GET_CURRENT_GOALS.value,
    GoalToolDefinitions.GET_GOAL_DETAIL.value,

    MilestoneToolDefinitions.CREATE_MILESTONE_PROPOSALS.value,
    MilestoneToolDefinitions.GET_MILESTONE_LIST.value,
    MilestoneToolDefinitions.GET_MILESTONE_DETAIL.value,

    TaskToolDefinitions.CREATE_TASK_PROPOSALS.value,
    TaskToolDefinitions.GET_TASK_LIST.value,
    TaskToolDefinitions.GET_TASK_DETAIL.value,

    ScheduleToolDefinitions.CREATE_SCHEDULED_TASK_PROPOSAL.value,
    ScheduleToolDefinitions.GET_SCHEDULE_TASK_DETAILS.value,
    ScheduleToolDefinitions.GET_SCHEDULE_TASK_LIST.value,
]

AVAILABLE_TOOLS = {
    **GOAL_TOOLS,
    **MILESTONE_TOOLS,
    **TASK_TOOLS,
    **SCHEDULE_TOOLS,
}

AGENT_TOOL_DEFINITIONS: dict[str, list[dict]] = {
    "shadow": ALL_TOOL_DEFINITIONS,
    "goal_coach": GOAL_COACH_TOOL_DEFINITIONS,
    "career_advisor": [],
    "insights": [],
}


def execute_tool(name: str, arguments: dict, context: ToolContext) -> dict:
    tool = AVAILABLE_TOOLS.get(name)
    if tool is None:
        raise LLMUnknownToolError(f"Unknown tool requested: {name}")
    return tool(context, arguments)
