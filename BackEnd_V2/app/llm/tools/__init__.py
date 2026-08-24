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

MAX_TOOL_ITERATIONS = 3

# After these tools run, no re-query is needed — the final structured parse handles the response.
TERMINAL_TOOL_NAMES: frozenset[str] = frozenset({"tool_refine_goal"})

ALL_TOOL_DEFINITIONS: list[dict] = [
    *GOAL_TOOL_DEFINITIONS,
    *MILESTONE_TOOL_DEFINITIONS,
    *TASK_TOOL_DEFINITIONS,
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
]

AVAILABLE_TOOLS = {
    **GOAL_TOOLS,
    **MILESTONE_TOOLS,
    **TASK_TOOLS,
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
