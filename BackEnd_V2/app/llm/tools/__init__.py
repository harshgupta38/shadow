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
from app.llm.tools import goal_progress, habits, journal, plan, reports, snapshot

# Rounds of tool calls one reply may use. The Workout Coach gets more: a plan takes two (look things up, then propose), and the rest is
# headroom for one corrected retry, because a request that runs out of rounds fails after its tokens are already spent. The agents that
# read across the whole app get one more than the rest, because a broad question can look something up, then look into what it found.
# Every other agent keeps the lower limit, so a stuck one costs less.
DEFAULT_MAX_TOOL_ITERATIONS = 3
AGENT_MAX_TOOL_ITERATIONS: dict[str, int] = {
    "workout_coach": 5,
    "shadow": 4,
    "goal_coach": 4,
    "insights": 4,
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

# Read-only tools over the rest of the app (plan, habits, goal progress, journal, reports, a one-call snapshot, what is coming up).
# They are handed out per agent below: every tool is sent with every request and counts against the user's daily AI allowance.
APP_READ_TOOL_DEFINITIONS: dict[str, dict] = {
    **snapshot.TOOL_DEFINITIONS,
    **plan.TOOL_DEFINITIONS,
    **habits.TOOL_DEFINITIONS,
    **goal_progress.TOOL_DEFINITIONS,
    **reports.TOOL_DEFINITIONS,
    **journal.TOOL_DEFINITIONS,
}

AVAILABLE_TOOLS = {
    **GOAL_TOOLS,
    **MILESTONE_TOOLS,
    **TASK_TOOLS,
    **SCHEDULE_TOOLS,
    **DIET_TOOLS,
    **WORKOUT_TOOLS,
    **snapshot.TOOLS,
    **plan.TOOLS,
    **habits.TOOLS,
    **goal_progress.TOOLS,
    **reports.TOOLS,
    **journal.TOOLS,
}


def _app_tools(*names: str) -> list[dict]:
    return [APP_READ_TOOL_DEFINITIONS[name] for name in names]


def _borrowed(definitions: list[dict], *names: str) -> list[dict]:
    """Tools of another agent that this one may also use, picked by name from that agent's definitions."""
    by_name = {d["function"]["name"]: d for d in definitions}
    return [by_name[name] for name in names]


AGENT_TOOL_DEFINITIONS: dict[str, list[dict]] = {
    # The general assistant sees the whole day at a glance; training and nutrition detail stay with their coaches.
    "shadow": [
        *ALL_TOOL_DEFINITIONS,
        *_app_tools("get_life_snapshot", "get_daily_plan", "get_habits", "get_goal_progress", "get_reports", "get_journal", "get_upcoming_schedule"),
    ],
    "goal_coach": [
        *GOAL_COACH_TOOL_DEFINITIONS,
        *_app_tools("get_goal_progress", "get_habits", "get_daily_plan", "get_upcoming_schedule"),
    ],
    "career_advisor": [
        *_borrowed(GOAL_COACH_TOOL_DEFINITIONS, "get_current_goals", "get_goal_detail"),
        *_app_tools("get_goal_progress"),
    ],
    # Insights reads patterns across every area, so it also borrows the two history tools of the coaches.
    "insights": [
        *_app_tools("get_life_snapshot", "get_plan_history", "get_goal_progress", "get_habits", "get_reports", "get_journal", "get_daily_plan"),
        *_borrowed(WORKOUT_TOOL_DEFINITIONS, "get_workout_history"),
        *_borrowed(DIET_TOOL_DEFINITIONS, "get_diet_history"),
    ],
    # The two coaches each see a little of the other's area, because training and eating shape each other.
    "diet_coach": [*DIET_TOOL_DEFINITIONS, *_borrowed(WORKOUT_TOOL_DEFINITIONS, "get_workout_overview")],
    "workout_coach": [*WORKOUT_TOOL_DEFINITIONS, *_borrowed(DIET_TOOL_DEFINITIONS, "get_diet_history")],
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
