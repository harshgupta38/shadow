"""Agent orchestration — thin, DB-free helpers over the LLM provider.

Every function here takes an :class:`LLMProvider` so callers can inject a
fake in tests. None of these touch the database; services pass in the
compiled user-context string.
"""

from __future__ import annotations

from app.agents.personas import system_prompt
from app.llm.base import LLMMessage, LLMProvider
from app.models.enums import AgentType


def _with_context(system: str, user_context: str) -> str:
    if not user_context:
        return system
    return f"{system}\n\n# About the user (context)\n{user_context}"


def generate_onboarding_understanding(
    provider: LLMProvider,
    *,
    question: str,
    answer: str,
    user_context: str = "",
) -> str:
    """Interpret an onboarding answer into a saved 'understanding'."""
    system = _with_context(system_prompt(AgentType.onboarding), user_context)
    prompt = (
        f"Onboarding question: {question}\n"
        f"User's answer: {answer}\n\n"
        "Write the understanding (1–3 sentences, third person)."
    )
    return provider.generate([LLMMessage("user", prompt)], system=system, temperature=0.4).strip()


def generate_chat_reply(
    provider: LLMProvider,
    *,
    agent_type: AgentType,
    history: list[LLMMessage],
    user_context: str = "",
) -> str:
    """Produce an assistant reply for a chat session."""
    system = _with_context(system_prompt(agent_type), user_context)
    return provider.generate(history, system=system).strip()


def suggest_goal_title(
    provider: LLMProvider,
    *,
    theme: str,
    user_context: str = "",
) -> str:
    """Suggest a single goal title, often phrased as a guiding question."""
    system = _with_context(system_prompt(AgentType.goal_coach), user_context)
    prompt = (
        f"Suggest ONE concise, motivating goal title about: {theme}. "
        "It may be phrased as a guiding question. Output only the title."
    )
    return provider.generate([LLMMessage("user", prompt)], system=system, temperature=0.8).strip()


def suggest_milestones(
    provider: LLMProvider,
    *,
    goal_title: str,
    goal_description: str = "",
    user_context: str = "",
    count: int = 4,
) -> list[str]:
    """Suggest milestone titles for a goal (one per line)."""
    system = _with_context(system_prompt(AgentType.goal_coach), user_context)
    prompt = (
        f"Goal: {goal_title}\n"
        f"Description: {goal_description or '(none)'}\n\n"
        f"Propose {count} concrete milestones, one per line, no numbering."
    )
    text = provider.generate([LLMMessage("user", prompt)], system=system, temperature=0.6)
    lines = [line.strip(" -•\t") for line in text.splitlines()]
    return [line for line in lines if line][:count]


def generate_report_narrative(
    provider: LLMProvider,
    *,
    metrics_summary: str,
    user_context: str = "",
) -> tuple[str, str]:
    """Return ``(narrative, next_steps)`` for a progress report."""
    system = _with_context(system_prompt(AgentType.progress_analyst), user_context)
    narrative = provider.generate(
        [
            LLMMessage(
                "user",
                "Write a short, motivating progress report (3–5 sentences) "
                f"from this data:\n{metrics_summary}",
            )
        ],
        system=system,
        temperature=0.5,
    ).strip()
    next_steps = provider.generate(
        [
            LLMMessage(
                "user",
                "Based on the same data, list 2–3 concrete next steps, one "
                f"per line:\n{metrics_summary}",
            )
        ],
        system=system,
        temperature=0.5,
    ).strip()
    return narrative, next_steps


def distill_behavior_signal(
    provider: LLMProvider,
    *,
    activity_summary: str,
    user_context: str = "",
) -> str:
    """Distill recent activity into a single behavior 'understanding'."""
    system = _with_context(system_prompt(AgentType.progress_analyst), user_context)
    prompt = (
        "From this recent activity, infer ONE concise behavior signal about "
        "the user (e.g. productive times, follow-through patterns, recurring "
        "blockers). Write 1 sentence, third person. If there is not enough "
        f"signal, reply exactly 'NONE'.\n\n{activity_summary}"
    )
    return provider.generate([LLMMessage("user", prompt)], system=system, temperature=0.3).strip()
