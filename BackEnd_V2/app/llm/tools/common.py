"""Pieces the assistants' tools share: a wrapper that keeps a tool from failing the request, date arguments, and the schema builder.

Each tool and each argument costs tokens on every step of a conversation (it is part of every request), so tools are few, their
descriptions short, and their results compact.
"""

import html
import re
from datetime import date, timedelta
from functools import wraps
from typing import Callable

from pydantic import ValidationError as PydanticValidationError

from app.common import today_ist
from app.core.exceptions import AppError
from app.llm.tools.context import ToolContext

MAX_BACK_DAYS = 90
MAX_AHEAD_DAYS = 14


def safe_tool(tool: Callable) -> Callable:
    """Turns any error inside a tool into a result the model can read, because a raised error would fail the whole request."""

    @wraps(tool)
    def run(context: ToolContext, arguments: dict) -> dict:
        try:
            return tool(context, arguments)
        except AppError as exc:
            return {"error": getattr(exc, "detail", None) or str(exc) or "That could not be done."}
        except PydanticValidationError as exc:
            problems = "; ".join(f"{'.'.join(str(p) for p in error['loc'])}: {error['msg']}" for error in exc.errors()[:5])
            return {"error": f"The request was not valid. {problems}"}
        except (ValueError, KeyError, TypeError) as exc:
            return {"error": f"The request could not be understood: {exc}"}

    return run


def weekday_name(day: date) -> str:
    return day.strftime("%A")


def day_from(arguments: dict, *, max_back: int = MAX_BACK_DAYS, max_ahead: int = 0) -> date:
    """The day the model asked for: `date` (YYYY-MM-DD), else `days_from_today` (negative is the past), else today.
    The chat prompt does not carry today's date, so relative days arrive as an offset the code can resolve."""
    today = today_ist()
    value = arguments.get("date")
    day = date.fromisoformat(str(value).strip()[:10]) if value else today + timedelta(days=arguments.get("days_from_today") or 0)
    if day < today - timedelta(days=max_back):
        raise ValueError(f"That is more than {max_back} days ago. Ask for a nearer date.")
    if day > today + timedelta(days=max_ahead):
        raise ValueError("That day has not come yet." if max_ahead == 0 else f"That is more than {max_ahead} days ahead.")
    return day


_BLOCK_END = re.compile(r"</(p|div|h[1-6]|li|blockquote)>|<br\s*/?>", re.IGNORECASE)
_TAG = re.compile(r"<[^>]+>")


def plain_text(value: str | None) -> str:
    """Readable text from stored rich text (the journal keeps the editor's HTML): one paragraph per line, no tags."""
    text = html.unescape(_TAG.sub("", _BLOCK_END.sub("\n", value or "")))
    return "\n".join(line.strip() for line in text.splitlines() if line.strip())


def trim(value: str | None, limit: int) -> str | None:
    if not value:
        return None
    value = value.strip()
    return value if len(value) <= limit else value[: limit - 1].rstrip() + "…"


def time_text(preferred: str | None, specific: str | None) -> str | None:
    """The time an item is meant for: a clock time, a part of the day, or nothing when it is flexible."""
    return specific or (preferred if preferred and preferred not in ("flexible", "custom") else None)


def tool_definition(name: str, description: str, properties: dict[str, dict] | None = None) -> dict:
    """A tool in OpenAI's strict form: every property required and extras forbidden, so an optional value is a nullable type."""
    properties = properties or {}
    return {
        "type": "function",
        "function": {
            "name": name,
            "description": description,
            "strict": True,
            "parameters": {"type": "object", "properties": properties, "required": list(properties), "additionalProperties": False},
        },
    }


def optional_int(description: str, minimum: int, maximum: int) -> dict:
    return {"type": ["integer", "null"], "minimum": minimum, "maximum": maximum, "description": description}


def optional_date(description: str) -> dict:
    return {"type": ["string", "null"], "description": description}
