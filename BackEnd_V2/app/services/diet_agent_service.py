"""One structured AI call for a Diet agent, with a timeout, a retry and a run record.

Every Diet agent (the food logger, the meal coach) asks the model for a validated object and falls back to plain code
when the provider is unavailable, so a provider problem never blocks the user. Each call leaves a DietAgentRunDBM row:
which agent, how long it took, how many tokens it used and whether it worked.
"""

import asyncio
import logging
from time import perf_counter

from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.exceptions import TokenLimitReachedError
from app.llm.service import get_llm_service_for_ai_behavior
from app.models.diet_agent_run import DietAgentRunDBM
from app.models.user import UserDBM
from app.services import settings_service

_logger = logging.getLogger(__name__)

DEFAULT_TIMEOUT_SECONDS = 30
DEFAULT_ATTEMPTS = 2


def record_run(db: Session, user: UserDBM, *, agent: str, status: str, summary: str, started: float, provider: str = "", model: str = "",
               error: str = "", input_tokens: int = 0, output_tokens: int = 0) -> DietAgentRunDBM:
    run = DietAgentRunDBM(
        user_id=user.id, agent=agent, status=status, provider=provider, model=model[:60], input_summary=summary[:300],
        error=error[:300], latency_ms=int((perf_counter() - started) * 1000), input_tokens=input_tokens, output_tokens=output_tokens,
    )
    db.add(run)
    db.flush()
    return run


async def ask_llm(
    db: Session,
    user: UserDBM,
    *,
    agent: str,
    system: str,
    content: str,
    schema: type[BaseModel],
    operation: str,
    timeout: float = DEFAULT_TIMEOUT_SECONDS,
    attempts: int = DEFAULT_ATTEMPTS,
    max_tokens: int | None = None,
    reasoning_effort: str | None = None,
) -> tuple[BaseModel | None, DietAgentRunDBM]:
    """One structured call with a timeout and retries. Returns (None, run) when the provider is unavailable so callers can fall back."""
    started = perf_counter()
    error = ""
    for attempt in range(1, attempts + 1):
        try:
            service = get_llm_service_for_ai_behavior(settings_service.get_ai_behavior(db, user.id))
            response = await asyncio.wait_for(
                # No temperature is sent: some models reject anything but their default, and code validates the output anyway.
                service.generate_structured(
                    system_instruction=system, user_content=content, schema_cls=schema, user_id=user.id, operation=operation,
                    max_tokens=max_tokens, reasoning_effort=reasoning_effort,
                ),
                timeout=timeout,
            )
            usage = response.usage
            run = record_run(
                db, user, agent=agent, status="ok", summary=content, started=started,
                provider=str(response.provider.value if hasattr(response.provider, "value") else response.provider),
                model=response.model_str or "", input_tokens=(usage.input_tokens or 0) if usage else 0, output_tokens=(usage.output_tokens or 0) if usage else 0,
            )
            return response.data, run
        except TokenLimitReachedError as exc:
            # The person's AI allowance for today is used up. That is not a provider problem: the caller decides what to show.
            record_run(db, user, agent=agent, status="fallback", summary=content, started=started, error=f"{type(exc).__name__}: {exc}")
            raise
        except Exception as exc:  # a provider problem (incl. timeout) must never block the user
            error = f"{type(exc).__name__}: {exc}"
            _logger.warning("Diet %s attempt %d failed: %s", operation, attempt, error)
            status = getattr(exc.__cause__, "status_code", None) or getattr(exc.__cause__, "code", None)  # OpenAI/Claude vs Gemini
            if isinstance(status, int) and 400 <= status < 500 and status != 429:
                break  # the provider rejected the request itself; trying again cannot help
    return None, record_run(db, user, agent=agent, status="fallback", summary=content, started=started, error=error)
