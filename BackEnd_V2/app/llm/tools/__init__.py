from app.llm.exceptions import LLMUnknownToolError
from app.llm.tools.context import ToolContext
from app.llm.tools.goals import GOAL_TOOL_DEFINITIONS, GOAL_TOOLS

TOOL_DEFINITIONS: list[dict] = [
    *GOAL_TOOL_DEFINITIONS,
]

AVAILABLE_TOOLS = {
    **GOAL_TOOLS,
}


def execute_tool(name: str, arguments: dict, context: ToolContext) -> dict:
    tool = AVAILABLE_TOOLS.get(name)
    if tool is None:
        raise LLMUnknownToolError(f"Unknown tool requested: {name}")
    return tool(context, arguments)
