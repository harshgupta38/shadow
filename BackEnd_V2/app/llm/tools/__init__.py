from app.llm.exceptions import LLMUnknownToolError
from app.llm.tools.context import ToolContext
from app.llm.tools.diet import DIET_TOOL_DEFINITIONS, DIET_TOOLS
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
from app.llm.tools.workout import WORKOUT_TOOLS
from app.llm.tools.workout_definitions import WORKOUT_TOOL_DEFINITIONS

# Rounds of tool calls one reply may use. The Workout Coach gets more: a plan takes two (look things up, then propose), and the rest is
# headroom for one corrected retry, because a request that runs out of rounds fails after its tokens are already spent. Every other agent
# keeps the lower limit, so a stuck one costs less.
DEFAULT_MAX_TOOL_ITERATIONS = 3
AGENT_MAX_TOOL_ITERATIONS: dict[str, int] = {
    "workout_coach": 5,
}


def max_tool_iterations(agent_type: str) -> int:
    return AGENT_MAX_TOOL_ITERATIONS.get(agent_type, DEFAULT_MAX_TOOL_ITERATIONS)

# After these tools run, no re-query is needed — the final structured parse handles the response.
TERMINAL_TOOL_NAMES: frozenset[str] = frozenset({
    "create_goal_proposal",                # writes refined goal to context.action_data; UI renders it
    "create_milestone_proposals",          # writes proposals to context.action_data; UI renders them
    "create_task_proposals",               # writes proposals to context.action_data; UI renders them
    "create_scheduled_task_proposal",      # writes proposal to context.action_data; UI renders it
    "create_workout_plan_proposal",        # writes the plan to context.action_data; UI renders it for review
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
    **DIET_TOOLS,
    **WORKOUT_TOOLS,
}

AGENT_TOOL_DEFINITIONS: dict[str, list[dict]] = {
    "shadow": ALL_TOOL_DEFINITIONS,
    "goal_coach": GOAL_COACH_TOOL_DEFINITIONS,
    "career_advisor": [],
    "insights": [],
    "diet_coach": DIET_TOOL_DEFINITIONS,
    "workout_coach": WORKOUT_TOOL_DEFINITIONS,
}


# Reasoning models think before they answer, and that thinking is billed as output against the user's daily AI allowance. An agent that
# mostly looks things up and fills in a form needs little of it, so it asks for less. Only providers that have such a setting use this.
AGENT_REASONING_EFFORT: dict[str, str] = {
    "workout_coach": "low",
}


def direct_reply(executed: list[tuple[str, object]]) -> str | None:
    """The finished reply a terminal tool wrote for itself, when every tool of this step was terminal and has one. Using it as is
    saves the model call that would only re-read the tool's result and say the same thing, which costs the user AI allowance."""
    if not executed or any(name not in TERMINAL_TOOL_NAMES for name, _ in executed):
        return None
    replies = [result.get("final_reply") if isinstance(result, dict) else None for _, result in executed]
    return replies[-1] if all(replies) else None


def execute_tool(name: str, arguments: dict, context: ToolContext) -> dict:
    tool = AVAILABLE_TOOLS.get(name)
    if tool is None:
        raise LLMUnknownToolError(f"Unknown tool requested: {name}")
    return tool(context, arguments)
