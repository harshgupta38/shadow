import json
from typing import Any, get_args, get_origin, Literal

from pydantic import BaseModel


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
    schema_example = json.dumps(
        build_schema_example(model_cls), indent=2, ensure_ascii=False
    )
    field_descriptions = [
        f"- {field_name}: {field.description}"
        for field_name, field in model_cls.model_fields.items()
        if field.description
    ]

    if not field_descriptions:
        return schema_example

    return schema_example + "\n\nField descriptions:\n" + "\n".join(field_descriptions)
