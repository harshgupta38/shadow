"""Agent orchestration — thin, DB-free helpers over the LLM provider.

Every function here takes an :class:`LLMProvider` so callers can inject a
fake in tests. None of these touch the database; services pass in the
compiled user-context string.
"""

from __future__ import annotations

import datetime

from app.agents.personas import (
    manual_memory_refiner_prompt,
    manual_memory_validator_prompt,
    system_prompt,
)
from app.llm.base import LLMMessage, LLMProvider
from app.models.enums import AgentType, MemoryCategory


def _with_context(system: str, user_context: str) -> str:
    today = datetime.date.today().isoformat()
    date_guard = (
        "# Date guardrails\n"
        f"- Today's date (UTC): {today}.\n"
        "- When suggesting timelines, milestones, estimated completion dates, or due dates, "
        "never use past dates.\n"
        "- Prefer realistic future dates unless the user explicitly asks for historical examples."
    )

    if not user_context:
        return f"{system}\n\n{date_guard}"
    return f"{system}\n\n{date_guard}\n\n# About the user (context)\n{user_context}"


def generate_onboarding_understanding(
    provider: LLMProvider,
    *,
    question: str,
    answer: str,
    user_context: str = "",
    model: str | None = None,
) -> str:
    """Interpret an onboarding answer into a saved 'understanding'."""
    system = _with_context(system_prompt(AgentType.onboarding), user_context)
    prompt = (
        f"Onboarding question: {question}\n"
        f"User's answer: {answer}\n\n"
        "Write the understanding (1–3 sentences, third person)."
    )
    return provider.generate(
        [LLMMessage("user", prompt)],
        system=system,
        temperature=0.4,
        model=model,
    ).strip()


def generate_manual_memory_understanding(
    provider: LLMProvider,
    *,
    raw_text: str,
    category: MemoryCategory,
    user_context: str = "",
    validation_feedback: str | None = None,
    model: str | None = None,
) -> str:
    """Generate the long-term memory Shadow should store from a manual note."""

    system = _with_context(manual_memory_refiner_prompt(), user_context)

    prompt = (
        f"Memory Category: {category.value}\n"
        f"Raw User Note:\n{raw_text}\n\n"
        "Task:\n"
        "Generate the memory Shadow should permanently remember about this user.\n"
        "This is a memory-understanding task, not an English rewriting task.\n\n"
        "Requirements:\n"
        "- Preserve every explicit fact from the raw note.\n"
        "- Keep all measurable details exactly (numbers, quantities, frequencies, targets, durations, dates).\n"
        "- Keep named entities and key terms exactly (for example Google, LeetCode, DSA).\n"
        "- Refer to the person as 'The user'. Do not use a personal name unless it appears in the raw note.\n"
        "- Never invent facts.\n"
        "- Never remove or weaken intent.\n"
        "- Never generalize measurable facts into vague words.\n"
        "- Capture enduring insight useful for future personalization (goals, habits, motivations, preferences, constraints, working style).\n"
        "- Natural professional third-person prose.\n"
        "- No markdown, no bullets, no labels.\n"
        "- Usually 1–3 sentences. If one sentence is enough, use one sentence.\n"
        "- Output only the final memory paragraph."
    )

    if validation_feedback:
        prompt += (
            "\n\n"
            "Previous candidate failed validation for this reason:\n"
            f"{validation_feedback}\n\n"
            "Regenerate the memory and fix the issue while preserving all explicit facts."
        )

    return provider.generate(
        [LLMMessage("user", prompt)],
        system=system,
        temperature=0.1,
        max_tokens=900,
        model=model,
    ).strip()


def validate_manual_memory_understanding(
    provider: LLMProvider,
    *,
    raw_text: str,
    candidate_memory: str,
    model: str | None = None,
) -> tuple[bool, str]:
    """Validate a generated manual memory for strict fact preservation."""
    prompt = (
        "Raw User Note:\n"
        f"{raw_text}\n\n"
        "Candidate Memory:\n"
        f"{candidate_memory}\n\n"
        "Validate candidate memory against the raw note using the system rules.\n"
        "Return exactly one line:\n"
        "PASS\n"
        "or\n"
        "FAIL: <short reason>"
    )
    verdict = provider.generate(
        [LLMMessage("user", prompt)],
        system=manual_memory_validator_prompt(),
        temperature=0,
        max_tokens=240,
        model=model,
    ).strip()

    normalized = verdict.strip()
    first_line = normalized.splitlines()[0].strip("`* ") if normalized else ""
    upper = first_line.upper()

    if upper == "PASS" or upper.startswith("PASS"):
        return True, ""
    if upper == "FAIL" or upper.startswith("FAIL"):
        if ":" in first_line:
            reason = first_line.split(":", 1)[1].strip()
            return False, reason or "Memory validation failed."
        return False, "Validator returned FAIL without a reason."
    return False, "Validator returned unexpected output."


def generate_chat_reply(
    provider: LLMProvider,
    *,
    agent_type: AgentType,
    history: list[LLMMessage],
    user_context: str = "",
    response_format_hint: str | None = None,
    response_style_instruction: str | None = None,
    max_tokens: int | None = None,
    model: str | None = None,
) -> str:
    """Produce an assistant reply for a chat session."""
    system = _with_context(system_prompt(agent_type), user_context)
    if response_style_instruction:
        system = f"{system}\n\n# Runtime response style\n{response_style_instruction.strip()}"
    if response_format_hint:
        system = f"{system}\n\n# Chat response contract\n{response_format_hint.strip()}"
    return provider.generate(history, system=system, max_tokens=max_tokens, model=model).strip()


def generate_chat_title(
    provider: LLMProvider,
    *,
    agent_type: AgentType,
    history: list[LLMMessage],
    user_context: str = "",
    model: str | None = None,
) -> str:
    """Generate a concise contextual title for a chat session."""
    system = _with_context(system_prompt(agent_type), user_context)
    recent_history = history[-6:]
    prompt = (
        "Generate a concise conversation title based on this chat.\n"
        "Rules:\n"
        "- 2 to 4 words.\n"
        "- Plain text only.\n"
        "- Do not include markdown, bullets, or quotation marks.\n"
        "- Focus on the user's topic or intent, not the assistant name.\n"
        "- Output only the title."
    )
    return provider.generate(
        [*recent_history, LLMMessage("user", prompt)],
        system=system,
        temperature=0.2,
        max_tokens=24,
        model=model,
    ).strip()


def propose_chat_actions(
    provider: LLMProvider,
    *,
    agent_type: AgentType,
    history: list[LLMMessage],
    user_context: str = "",
    max_tokens: int | None = None,
    model: str | None = None,
) -> str:
    """Propose structured app actions from the latest chat turn as JSON text."""
    system = _with_context(system_prompt(agent_type), user_context)
    recent_history = history[-8:]
    prompt = (
        "Inspect this conversation and propose follow-up in-app actions.\n"
        "Allowed modules: plan, goals, track, repetitive_tasks.\n"
        "Allowed action types: plan.create_task, goals.create_goal, "
        "goals.add_milestone, track.create_metric, track.log_metric, "
        "repetitive_tasks.create_task.\n"
        "Use conservative confidence: high only when user intent and required arguments are explicit.\n"
        "Never invent hidden assumptions. If uncertain, set confidence to medium or low.\n"
        "If no concrete action should be proposed, return an empty actions list.\n"
        "Destructive actions are not allowed in this version; always set destructive=false.\n"
        "Return valid JSON only. No markdown and no prose.\n"
        "Schema:\n"
        "{\n"
        '  "actions": [\n'
        "    {\n"
        '      "module": "plan|goals|track|repetitive_tasks",\n'
        '      "type": "plan.create_task|goals.create_goal|goals.add_milestone|track.create_metric|track.log_metric|repetitive_tasks.create_task",\n'
        '      "title": "Short action title",\n'
        '      "rationale": "Why this helps",\n'
        '      "confidence": "high|medium|low",\n'
        '      "requires_confirmation": true,\n'
        '      "destructive": false,\n'
        '      "args": { ... }\n'
        "    }\n"
        "  ]\n"
        "}"
    )
    return provider.generate(
        [*recent_history, LLMMessage("user", prompt)],
        system=system,
        temperature=0.1,
        max_tokens=max_tokens if max_tokens is not None else 420,
        model=model,
    ).strip()


def suggest_goal_title(
    provider: LLMProvider,
    *,
    theme: str,
    user_context: str = "",
    model: str | None = None,
) -> str:
    """Suggest a single goal title, often phrased as a guiding question."""
    system = _with_context(system_prompt(AgentType.goal_coach), user_context)
    prompt = (
        f"Suggest ONE concise, motivating goal title about: {theme}. "
        "It may be phrased as a guiding question. Output only the title."
    )
    return provider.generate(
        [LLMMessage("user", prompt)],
        system=system,
        temperature=0.8,
        model=model,
    ).strip()


def suggest_milestones(
    provider: LLMProvider,
    *,
    goal_title: str,
    goal_description: str = "",
    user_context: str = "",
    count: int = 4,
    model: str | None = None,
) -> list[str]:
    """Suggest milestone titles for a goal (one per line)."""
    system = _with_context(system_prompt(AgentType.goal_coach), user_context)
    prompt = (
        f"Goal: {goal_title}\n"
        f"Description: {goal_description or '(none)'}\n\n"
        f"Propose {count} concrete milestones, one per line, no numbering."
    )
    text = provider.generate(
        [LLMMessage("user", prompt)],
        system=system,
        temperature=0.6,
        model=model,
    )
    lines = [line.strip(" -•\t") for line in text.splitlines()]
    return [line for line in lines if line][:count]


def generate_goal_draft_from_prompt(
    provider: LLMProvider,
    *,
    prompt_text: str,
    user_context: str = "",
    model: str | None = None,
) -> str:
    """Convert a natural-language goal prompt into strict JSON goal fields."""
    system = _with_context(system_prompt(AgentType.goal_coach), user_context)
    prompt = (
        "User goal idea:\n"
        f"{prompt_text}\n\n"
        "Extract a single structured goal object from this idea.\n"
        "Return valid JSON only with this exact schema:\n"
        "{\"title\":\"...\",\"description\":\"...\",\"category\":\"...\",\"target_date\":\"YYYY-MM-DD\"|null}\n"
        "Rules:\n"
        "- Keep title concise and actionable.\n"
        "- Description should be short and practical.\n"
        "- Category should be a short phrase (for example Career, Health, Learning).\n"
        "- Use null for unknown target_date.\n"
        "- Do not include markdown, prose, or extra keys."
    )
    return provider.generate(
        [LLMMessage("user", prompt)],
        system=system,
        temperature=0.2,
        max_tokens=260,
        model=model,
    ).strip()


def repair_goal_draft_json(
    provider: LLMProvider,
    *,
    prompt_text: str,
    malformed_output: str,
    user_context: str = "",
    model: str | None = None,
) -> str:
    """Ask the model to re-emit a malformed goal draft as strict JSON."""
    system = _with_context(system_prompt(AgentType.goal_coach), user_context)
    prompt = (
        "The previous response did not follow the required JSON schema.\n"
        "Rewrite it as strict JSON only.\n\n"
        "User goal idea:\n"
        f"{prompt_text}\n\n"
        "Previous malformed output:\n"
        f"{malformed_output}\n\n"
        "Return valid JSON only with this exact schema:\n"
        "{\"title\":\"...\",\"description\":\"...\",\"category\":\"...\",\"target_date\":\"YYYY-MM-DD\"|null}\n"
        "Rules:\n"
        "- Keep title concise and actionable.\n"
        "- Description should be short and practical.\n"
        "- Category should be a short phrase (for example Career, Health, Learning).\n"
        "- Use null for unknown target_date.\n"
        "- Do not include markdown, prose, or extra keys."
    )
    return provider.generate(
        [LLMMessage("user", prompt)],
        system=system,
        temperature=0,
        max_tokens=260,
        model=model,
    ).strip()


def generate_metric_draft_from_prompt(
    provider: LLMProvider,
    *,
    prompt_text: str,
    user_context: str = "",
    model: str | None = None,
) -> str:
    """Convert a natural-language metric idea into strict JSON metric fields."""
    system = _with_context(system_prompt(AgentType.progress_analyst), user_context)
    prompt = (
        "User metric idea:\n"
        f"{prompt_text}\n\n"
        "Extract one structured metric object from this idea.\n"
        "Return valid JSON only with this exact schema:\n"
        '{"label":"...","unit_text":"...","time_span":"day|week|month|year|custom","time_span_custom_text":"..."|null,"target":number|null,"rationale":"..."}\n'
        "Rules:\n"
        "- Label must be concise and user-facing.\n"
        "- unit_text must be what the user tracks (for example minutes, hours, problems, km).\n"
        "- time_span must be one of day, week, month, year, custom.\n"
        "- Use time_span_custom_text only when time_span is custom.\n"
        "- target can be null when not explicitly requested.\n"
        "- Never use streak as a metric.\n"
        "- Do not include markdown, prose, or extra keys."
    )
    return provider.generate(
        [LLMMessage("user", prompt)],
        system=system,
        temperature=0.2,
        max_tokens=300,
        model=model,
    ).strip()


def repair_metric_draft_json(
    provider: LLMProvider,
    *,
    prompt_text: str,
    malformed_output: str,
    user_context: str = "",
    model: str | None = None,
) -> str:
    """Ask the model to re-emit a malformed metric draft as strict JSON."""
    system = _with_context(system_prompt(AgentType.progress_analyst), user_context)
    prompt = (
        "The previous response did not follow the required JSON schema.\n"
        "Rewrite it as strict JSON only.\n\n"
        "User metric idea:\n"
        f"{prompt_text}\n\n"
        "Previous malformed output:\n"
        f"{malformed_output}\n\n"
        "Return valid JSON only with this exact schema:\n"
        '{"label":"...","unit_text":"...","time_span":"day|week|month|year|custom","time_span_custom_text":"..."|null,"target":number|null,"rationale":"..."}\n'
        "Rules:\n"
        "- Label must be concise and user-facing.\n"
        "- unit_text should describe what is counted/measured.\n"
        "- Use time_span_custom_text only when time_span is custom.\n"
        "- target can be null when unknown.\n"
        "- Never use streak as a metric.\n"
        "- Do not include markdown, prose, or extra keys."
    )
    return provider.generate(
        [LLMMessage("user", prompt)],
        system=system,
        temperature=0,
        max_tokens=300,
        model=model,
    ).strip()


def generate_schedule_task_draft_json(
    provider: LLMProvider,
    *,
    prompt_text: str,
    on_date: str,
    active_habits_summary: str,
    active_goals_summary: str,
    user_context: str = "",
    model: str | None = None,
) -> str:
    """Convert a natural-language schedule prompt into strict JSON task fields."""
    system = _with_context(system_prompt(AgentType.daily_checkin), user_context)
    prompt = (
        f"Planning context date: {on_date}\n\n"
        "User request:\n"
        f"{prompt_text}\n\n"
        "Active habits (for linked_habit_id selection):\n"
        f"{active_habits_summary}\n\n"
        "Active goals (for related_goal_id selection):\n"
        f"{active_goals_summary}\n\n"
        "Extract one structured scheduled-task draft from the request.\n"
        "Return valid JSON only with this exact schema:\n"
        '{"title":"...","description":"..."|null,"date":"YYYY-MM-DD"|null,"priority":"critical|high|medium|low"|null,"linked_habit_id":123|null,"related_goal_id":456|null}\n'
        "Rules:\n"
        "- Title must be concise and actionable.\n"
        "- description can include practical details; use null when none.\n"
        "- date should be inferred when explicit (for example 'on friday'); else null.\n"
        "- linked_habit_id must be one of provided habit ids when clearly matched; else null.\n"
        "- related_goal_id must be one of provided goal ids when clearly matched; else null.\n"
        "- Do not invent ids outside provided lists.\n"
        "- Do not include markdown, prose, or extra keys."
    )
    return provider.generate(
        [LLMMessage("user", prompt)],
        system=system,
        temperature=0.15,
        max_tokens=360,
        model=model,
    ).strip()


def repair_schedule_task_draft_json(
    provider: LLMProvider,
    *,
    prompt_text: str,
    on_date: str,
    active_habits_summary: str,
    active_goals_summary: str,
    malformed_output: str,
    user_context: str = "",
    model: str | None = None,
) -> str:
    """Repair malformed schedule task draft output into strict JSON schema."""
    system = _with_context(system_prompt(AgentType.daily_checkin), user_context)
    prompt = (
        "The previous output did not follow the required JSON schema.\n"
        "Rewrite it as strict JSON only.\n\n"
        f"Planning context date: {on_date}\n\n"
        "User request:\n"
        f"{prompt_text}\n\n"
        "Active habits (for linked_habit_id selection):\n"
        f"{active_habits_summary}\n\n"
        "Active goals (for related_goal_id selection):\n"
        f"{active_goals_summary}\n\n"
        "Malformed output to repair:\n"
        f"{malformed_output}\n\n"
        "Return valid JSON only with this exact schema:\n"
        '{"title":"...","description":"..."|null,"date":"YYYY-MM-DD"|null,"priority":"critical|high|medium|low"|null,"linked_habit_id":123|null,"related_goal_id":456|null}\n'
        "Rules:\n"
        "- linked_habit_id and related_goal_id must come only from provided lists, or be null.\n"
        "- Use null when uncertain instead of guessing.\n"
        "- Do not include markdown, prose, or extra keys."
    )
    return provider.generate(
        [LLMMessage("user", prompt)],
        system=system,
        temperature=0,
        max_tokens=360,
        model=model,
    ).strip()


def generate_today_plan_json(
    provider: LLMProvider,
    *,
    on_date: str,
    goals_summary: str,
    repetitive_summary: str,
    carry_forward_summary: str,
    manual_tasks_summary: str,
    user_context: str = "",
    model: str | None = None,
) -> str:
    """Generate a structured daily plan payload as strict JSON."""
    system = _with_context(system_prompt(AgentType.daily_checkin), user_context)
    prompt = (
        f"Plan date: {on_date}\n\n"
        "Active goals context:\n"
        f"{goals_summary}\n\n"
        "Recurring tasks due today:\n"
        f"{repetitive_summary}\n\n"
        "Unfinished carry-forward candidates from yesterday:\n"
        f"{carry_forward_summary}\n\n"
        "Manual tasks already present for the same date:\n"
        f"{manual_tasks_summary}\n\n"
        "Create a realistic, non-duplicative daily plan.\n"
        "Return valid JSON only (no markdown, no prose) with this exact schema:\n"
        "{\"tasks\":[{\"title\":\"...\",\"related_goal_id\":123|null,\"priority\":\"critical|high|medium|low\",\"estimated_duration_minutes\":45|null,\"suggested_start_time\":\"HH:MM\"|null,\"suggested_finish_by_time\":\"HH:MM\"|null,\"ai_rationale\":\"...\",\"ai_impact_if_skipped\":\"...\"|null,\"ai_confidence_score\":75|null}]}\n"
        "Rules:\n"
        "- Maximum 8 tasks.\n"
        "- Never duplicate manual tasks already listed.\n"
        "- Prefer carry-forward and high-value goal work.\n"
        "- Treat recurring-task descriptions as constraints; when they mention fixed time windows, preserve them in suggested_start_time and suggested_finish_by_time.\n"
        "- If recurring-task descriptions mention explicit duration hints (for example 45min, 2hr, 1h30m), set estimated_duration_minutes accordingly even when exact start/end time is not fixed.\n"
        "- Keep timing realistic; avoid overloaded schedules.\n"
        "- Set estimated_duration_minutes only when you can justify it from task scope; otherwise set it to null.\n"
        "- Avoid one-size-fits-all durations across tasks.\n"
        "- Set suggested_start_time and suggested_finish_by_time only when you intentionally schedule that task; otherwise set both to null.\n"
        "- Use null for unknown optional fields.\n"
        "- Keep ai_rationale concise and specific.\n"
        "- ai_impact_if_skipped should describe realistic downside in one sentence, specific to that task.\n"
        "- When related_goal_id is set, ai_impact_if_skipped should reflect consequence to that goal outcome.\n"
        "- Do not repeat the same ai_impact_if_skipped sentence across multiple tasks.\n"
        "- ai_confidence_score must be an integer from 0 to 100."
    )
    return provider.generate(
        [LLMMessage("user", prompt)],
        system=system,
        temperature=0.2,
        max_tokens=980,
        model=model,
    ).strip()


def repair_today_plan_json(
    provider: LLMProvider,
    *,
    on_date: str,
    malformed_output: str,
    goals_summary: str,
    repetitive_summary: str,
    carry_forward_summary: str,
    manual_tasks_summary: str,
    user_context: str = "",
    model: str | None = None,
) -> str:
    """Repair a malformed daily-plan response into strict JSON schema output."""
    system = _with_context(system_prompt(AgentType.daily_checkin), user_context)
    prompt = (
        "The previous output did not follow the required JSON schema.\n"
        "Rewrite it as strict JSON only.\n\n"
        f"Plan date: {on_date}\n\n"
        "Active goals context:\n"
        f"{goals_summary}\n\n"
        "Recurring tasks due today:\n"
        f"{repetitive_summary}\n\n"
        "Unfinished carry-forward candidates from yesterday:\n"
        f"{carry_forward_summary}\n\n"
        "Manual tasks already present for the same date:\n"
        f"{manual_tasks_summary}\n\n"
        "Malformed output to repair:\n"
        f"{malformed_output}\n\n"
        "Return valid JSON only (no markdown, no prose) with this exact schema:\n"
        "{\"tasks\":[{\"title\":\"...\",\"related_goal_id\":123|null,\"priority\":\"critical|high|medium|low\",\"estimated_duration_minutes\":45|null,\"suggested_start_time\":\"HH:MM\"|null,\"suggested_finish_by_time\":\"HH:MM\"|null,\"ai_rationale\":\"...\",\"ai_impact_if_skipped\":\"...\"|null,\"ai_confidence_score\":75|null}]}\n"
        "Rules:\n"
        "- Maximum 8 tasks.\n"
        "- Never duplicate manual tasks already listed.\n"
        "- Prefer carry-forward and high-value goal work.\n"
        "- Treat recurring-task descriptions as constraints; when they mention fixed time windows, preserve them in suggested_start_time and suggested_finish_by_time.\n"
        "- If recurring-task descriptions mention explicit duration hints (for example 45min, 2hr, 1h30m), set estimated_duration_minutes accordingly even when exact start/end time is not fixed.\n"
        "- Keep timing realistic; avoid overloaded schedules.\n"
        "- Set estimated_duration_minutes only when you can justify it from task scope; otherwise set it to null.\n"
        "- Avoid one-size-fits-all durations across tasks.\n"
        "- Set suggested_start_time and suggested_finish_by_time only when you intentionally schedule that task; otherwise set both to null.\n"
        "- Use null for unknown optional fields.\n"
        "- Keep ai_rationale concise and specific.\n"
        "- ai_impact_if_skipped should describe realistic downside in one sentence, specific to that task.\n"
        "- When related_goal_id is set, ai_impact_if_skipped should reflect consequence to that goal outcome.\n"
        "- Do not repeat the same ai_impact_if_skipped sentence across multiple tasks.\n"
        "- ai_confidence_score must be an integer from 0 to 100."
    )
    return provider.generate(
        [LLMMessage("user", prompt)],
        system=system,
        temperature=0,
        max_tokens=980,
        model=model,
    ).strip()


def estimate_today_task_durations_json(
    provider: LLMProvider,
    *,
    on_date: str,
    tasks_summary: str,
    user_context: str = "",
    model: str | None = None,
) -> str:
    """Estimate realistic single-day task durations as strict JSON."""
    system = _with_context(system_prompt(AgentType.daily_checkin), user_context)
    prompt = (
        f"Plan date: {on_date}\n\n"
        "Tasks requiring duration estimates:\n"
        f"{tasks_summary}\n\n"
        "Estimate only how many minutes the user should spend TODAY on each task.\n"
        "Return valid JSON only (no markdown, no prose) with this exact schema:\n"
        "{\"durations\":[{\"title\":\"...\",\"estimated_duration_minutes\":45|null}]}\n"
        "Rules:\n"
        "- Estimate single-session or same-day effort only.\n"
        "- Do NOT estimate long-term goal completion time (no weeks/months).\n"
        "- When task context includes explicit time or duration hints (for example 45min, 2hr, 1h30m, 10:00-11:30), use those hints as the primary duration signal.\n"
        "- Use realistic focus blocks, typically between 5 and 240 minutes.\n"
        "- If uncertain, set estimated_duration_minutes to null.\n"
        "- Keep title exactly aligned to the input title for mapping.\n"
        "- Do not add extra keys."
    )
    return provider.generate(
        [LLMMessage("user", prompt)],
        system=system,
        temperature=0.1,
        max_tokens=420,
        model=model,
    ).strip()


def repair_today_task_durations_json(
    provider: LLMProvider,
    *,
    on_date: str,
    tasks_summary: str,
    malformed_output: str,
    user_context: str = "",
    model: str | None = None,
) -> str:
    """Repair malformed today-duration estimates into strict JSON schema output."""
    system = _with_context(system_prompt(AgentType.daily_checkin), user_context)
    prompt = (
        "The previous output did not follow the required JSON schema.\n"
        "Rewrite it as strict JSON only.\n\n"
        f"Plan date: {on_date}\n\n"
        "Tasks requiring duration estimates:\n"
        f"{tasks_summary}\n\n"
        "Malformed output to repair:\n"
        f"{malformed_output}\n\n"
        "Return valid JSON only (no markdown, no prose) with this exact schema:\n"
        "{\"durations\":[{\"title\":\"...\",\"estimated_duration_minutes\":45|null}]}\n"
        "Rules:\n"
        "- Estimate single-session or same-day effort only.\n"
        "- Do NOT estimate long-term goal completion time (no weeks/months).\n"
        "- When task context includes explicit time or duration hints (for example 45min, 2hr, 1h30m, 10:00-11:30), use those hints as the primary duration signal.\n"
        "- Use realistic focus blocks, typically between 5 and 240 minutes.\n"
        "- If uncertain, set estimated_duration_minutes to null.\n"
        "- Keep title exactly aligned to the input title for mapping.\n"
        "- Do not add extra keys."
    )
    return provider.generate(
        [LLMMessage("user", prompt)],
        system=system,
        temperature=0,
        max_tokens=420,
        model=model,
    ).strip()


def recommend_progress_metric_json(
    provider: LLMProvider,
    *,
    habit_summary: str,
    user_context: str = "",
    model: str | None = None,
) -> str:
    """Infer whether a habit is measurable and propose a tracking metric as JSON."""
    system = _with_context(system_prompt(AgentType.progress_analyst), user_context)
    prompt = (
        "Analyze this habit and decide if it should map to a daily tracked metric.\n\n"
        "Habit details:\n"
        f"{habit_summary}\n\n"
        "Return valid JSON only (no markdown, no prose) with this exact schema:\n"
        "{\"measurable\":true|false,\"metric_name\":\"...\"|null,\"unit\":\"count|minutes|hours|custom\"|null,\"daily_target\":number|null,\"rationale\":\"...\"}\n"
        "Rules:\n"
        "- If measurable=false, set metric_name/unit/daily_target to null and explain briefly in rationale.\n"
        "- Only mark measurable=true when the habit can be quantified DAILY.\n"
        "- Recommend metrics only for objective quantities (examples: water intake, workout minutes, problems solved, distance run).\n"
        "- Do NOT recommend for binary attendance/consistency habits (examples: office attendance, commute, generic completion, streak, just showing up).\n"
        "- Never use streak as a metric, and never output streak-based units or targets.\n"
        "- metric_name must be concise and user-facing.\n"
        "- unit must be one of count, minutes, hours, custom.\n"
        "- daily_target must be a positive number when measurable=true.\n"
        "- Prefer realistic targets from the habit text. If explicit numbers exist, preserve them.\n"
        "- Do not include extra keys."
    )
    return provider.generate(
        [LLMMessage("user", prompt)],
        system=system,
        temperature=0.1,
        max_tokens=1200,
        model=model,
    ).strip()


def repair_progress_metric_json(
    provider: LLMProvider,
    *,
    habit_summary: str,
    malformed_output: str,
    user_context: str = "",
    model: str | None = None,
) -> str:
    """Repair malformed progress recommendation output into strict JSON schema."""
    system = _with_context(system_prompt(AgentType.progress_analyst), user_context)
    prompt = (
        "The previous output for a habit-to-metric recommendation was malformed or incomplete. "
        "Repair it into valid JSON only.\n\n"
        "Habit details:\n"
        f"{habit_summary}\n\n"
        "Malformed output:\n"
        f"{malformed_output}\n\n"
        "Return exactly one valid JSON object and nothing else using this schema:\n"
        "{\"measurable\":true|false,\"metric_name\":\"...\"|null,\"unit\":\"count|minutes|hours|custom\"|null,\"daily_target\":number|null,\"rationale\":\"...\"}\n"
        "Rules:\n"
        "- If unsure, return measurable=false with null metric fields.\n"
        "- Never use streak or attendance-style metrics.\n"
        "- Do not include extra keys."
    )
    return provider.generate(
        [LLMMessage("user", prompt)],
        system=system,
        temperature=0,
        max_tokens=1200,
        model=model,
    ).strip()


def generate_report_narrative(
    provider: LLMProvider,
    *,
    metrics_summary: str,
    user_context: str = "",
    response_style_instruction: str | None = None,
    narrative_max_tokens: int | None = None,
    next_steps_max_tokens: int | None = None,
    model: str | None = None,
) -> tuple[str, str]:
    """Return ``(narrative, next_steps)`` for a progress report."""
    system = _with_context(system_prompt(AgentType.progress_analyst), user_context)
    if response_style_instruction:
        system = f"{system}\n\n# Runtime response style\n{response_style_instruction.strip()}"
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
        # max_tokens=narrative_max_tokens,
        # model=model, # temporary patch to fix incomplete report generationg issue
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
        # max_tokens=next_steps_max_tokens,
        # model=model,
    ).strip()
    return narrative, next_steps


def distill_behavior_signal(
    provider: LLMProvider,
    *,
    activity_summary: str,
    user_context: str = "",
    model: str | None = None,
) -> str:
    """Distill recent activity into a single behavior 'understanding'."""
    system = _with_context(system_prompt(AgentType.progress_analyst), user_context)
    prompt = (
        "From this recent activity, infer ONE concise behavior signal about "
        "the user (e.g. productive times, follow-through patterns, recurring "
        "blockers). Write 1 sentence, third person. If there is not enough "
        f"signal, reply exactly 'NONE'.\n\n{activity_summary}"
    )
    return provider.generate(
        [LLMMessage("user", prompt)],
        system=system,
        temperature=0.3,
        model=model,
    ).strip()


def generate_journal_reflection(
    provider: LLMProvider,
    *,
    entry_content: str,
    mood: str | None,
    user_context: str = "",
    model: str | None = None,
) -> str:
    """Generate a contextual Shadow reflection for a journal entry."""
    system = _with_context(system_prompt(AgentType.daily_checkin), user_context)
    prompt = (
        "Journal entry:\n"
        f"{entry_content}\n\n"
        f"Mood: {mood or 'unspecified'}\n\n"
        "Write a personalized reflection in 3-5 sentences.\n"
        "Requirements:\n"
        "- Acknowledge what happened and the user's emotional tone.\n"
        "- Tie the reflection to active goals or recent progress signals when possible.\n"
        "- If this indicates a setback, respond with empathy and accountability.\n"
        "- End with one practical next step for tomorrow.\n"
        "- Plain text only, no markdown, no bullet points."
    )
    return provider.generate(
        [LLMMessage("user", prompt)],
        system=system,
        temperature=0.45,
        max_tokens=320,
        model=model,
    ).strip()


def generate_journal_goal_alignment(
    provider: LLMProvider,
    *,
    entry_content: str,
    mood: str | None,
    active_goals: list[str],
    user_context: str = "",
    model: str | None = None,
) -> str:
    """Generate explicit goal-alignment analysis for a journal entry."""
    system = _with_context(system_prompt(AgentType.progress_analyst), user_context)
    goals_block = "\n".join(f"- {goal}" for goal in active_goals) or "- No active goals"
    prompt = (
        "Journal entry:\n"
        f"{entry_content}\n\n"
        f"Mood: {mood or 'unspecified'}\n\n"
        "Active goals:\n"
        f"{goals_block}\n\n"
        "Write a clear goal-alignment analysis in 2-4 sentences.\n"
        "Must include:\n"
        "- Which active goals were supported, if any.\n"
        "- Which goals may be at risk or conflicted, if any.\n"
        "- One specific next move to improve alignment.\n"
        "Plain text only, no markdown, no bullet points."
    )
    return provider.generate(
        [LLMMessage("user", prompt)],
        system=system,
        temperature=0.3,
        max_tokens=260,
        model=model,
    ).strip()


def extract_journal_memory_insights(
    provider: LLMProvider,
    *,
    entry_content: str,
    mood: str | None,
    user_context: str = "",
    model: str | None = None,
) -> str:
    """Extract durable journal insights as strict JSON."""
    system = _with_context(system_prompt(AgentType.progress_analyst), user_context)
    prompt = (
        "Journal entry:\n"
        f"{entry_content}\n\n"
        f"Mood: {mood or 'unspecified'}\n\n"
        "Extract only durable personalization signals useful for future planning and coaching.\n"
        "Do not include one-off details.\n"
        "Output MUST be valid JSON with this exact shape:\n"
        "{\"insights\": [{\"category\": \"daily|weekly|monthly|career|life|personality|other\", \"understanding\": \"...\"}]}\n"
        "If there is no meaningful durable signal, return exactly: {\"insights\": []}\n"
        "No markdown fences, no extra keys, no commentary."
    )
    return provider.generate(
        [LLMMessage("user", prompt)],
        system=system,
        temperature=0.2,
        max_tokens=420,
        model=model,
    ).strip()
