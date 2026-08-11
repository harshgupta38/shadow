import json
from datetime import date
from typing import Any, get_args, get_origin, Literal

from pydantic import BaseModel

from app.schemas.goals import UnderstandGoalRequest, UnderstandGoalResponse

GOAL_REFINEMENT_SYSTEM_INSTRUCTION = (
    "You are an expert goal coach.\n"
    "Analyze the user's responses to build a complete goal profile.\n"
    "Base your conclusions on the user's answers.\n"
    "When required information is missing, infer the most reasonable value from the available context.\n"
    "Do not contradict the user's responses.\n"
    "Be realistic and concise.\n"
    "Return only a JSON object matching the required schema."
)


def _schema_example_for_annotation(
    annotation: object, field_name: str | None = None
) -> object:
    origin = get_origin(annotation)

    if origin is None:
        if isinstance(annotation, type):
            if issubclass(annotation, BaseModel):
                return build_schema_example(annotation)
            if annotation is str:
                if field_name and "date" in field_name.lower():
                    return "YYYY-MM-DD"
                return "string"
            if annotation is int:
                return 0
            if annotation is float:
                return 0.0
            if annotation is bool:
                return False
        return "string"

    if origin in (list, list[Any]):
        args = get_args(annotation)
        item_annotation = args[0] if args else str
        return [_schema_example_for_annotation(item_annotation, field_name=field_name)]

    if origin is dict:
        return {"key": "string"}

    if origin is Literal:
        args = get_args(annotation)
        if args:
            first_literal = args[0]
            return (
                first_literal
                if isinstance(first_literal, (str, int, float, bool))
                else "string"
            )
        return "string"

    args = [arg for arg in get_args(annotation) if arg is not type(None)]
    if args:
        return _schema_example_for_annotation(args[0], field_name=field_name)

    return "string"


def build_schema_example(model_cls: type[BaseModel]) -> dict[str, object]:
    return {
        field_name: _schema_example_for_annotation(field.annotation, field_name)
        for field_name, field in model_cls.model_fields.items()
    }


def build_schema_prompt(model_cls: type[BaseModel]) -> str:
    return json.dumps(build_schema_example(model_cls), indent=2, ensure_ascii=False)


GOAL_REFINEMENT_SYSTEM_INSTRUCTION_CLAUDE = (
    GOAL_REFINEMENT_SYSTEM_INSTRUCTION
    + "\n\nThe response MUST be a JSON object that exactly matches the UnderstandGoalResponse schema.\n"
    + "Use these exact field names.\n"
    + "Do not rename fields.\n"
    + "Do not use camelCase.\n"
    + "Do not add, remove, merge, or restructure fields.\n"
    + "Return only the JSON object.\n"
    + "Do not wrap it in Markdown.\n"
    + "Do not use backticks.\n"
    + "\n\nSchema:\n"
    + build_schema_prompt(UnderstandGoalResponse)
)


def build_goal_refinement_user_prompt(request_data: UnderstandGoalRequest) -> str:
    return (
        f"Current Date: {date.today().isoformat()}\n\n"
        "User Responses\n\n"
        f"Goal: {request_data.goal.strip()}\n"
        f"Why: {request_data.why.strip()}\n"
        f"Success: {request_data.success.strip()}\n"
        f"Current Situation: {request_data.reality.strip()}\n"
        f"Obstacles: {request_data.obstacles.strip()}\n\n"
        "Additional Instructions:\n"
        "- If the user does not specify a target date, estimate a realistic future date.\n"
        "- Success metrics should be specific and measurable.\n"
        "- Infer strengths from the user's current situation and responses.\n"
        "- Infer coaching insights that are directly supported by the user's responses."
    )
