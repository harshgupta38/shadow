"""Text-to-speech for the Daily Brief "Listen" feature.

Uses OpenAI's audio API directly (not the pluggable LLMProvider abstraction —
audio synthesis isn't implemented across every provider, and this is the only
caller today).
"""
import logging
from time import perf_counter

from openai import AsyncOpenAI, APIConnectionError, APIStatusError, OpenAIError

from app.analysis.llm_usage_logger import log_openai_audio_usage_async
from app.core.exceptions import AppError
from app.llm.config import llm_settings

logger = logging.getLogger(__name__)

_TTS_INSTRUCTIONS = (
    "Voice Affect: Calm, warm, and composed.\n"
    "Tone: Confident, supportive, and personal — like a trusted daily coach.\n"
    "Pacing: Steady and moderately paced. Never rush through tasks or times.\n"
    "Emotion: Gently encouraging. Sound focused and purposeful, not overly cheerful.\n"
    "Delivery: Speak as if briefing the user at the start of their day. "
    "Make important tasks and priorities feel clear and intentional.\n"
    "Pauses: Use short natural pauses between sections and before important tasks.\n"
    "Emphasis: Give slightly more emphasis to priorities, scheduled times, "
    "deadlines, and important actions.\n"
    "Pronunciation: Clear and natural. Avoid sounding like a narrator or reading a list."
)


async def synthesize_speech(text: str, *, user_id: int) -> bytes:
    """Returns MP3 bytes for the given text. Raises AppError on failure/misconfiguration."""
    if not llm_settings.openai_api_key:
        raise AppError("Text-to-speech is not configured on this server.")
    if not text.strip():
        raise AppError("Nothing to read aloud.")

    client = AsyncOpenAI(api_key=llm_settings.openai_api_key, timeout=llm_settings.llm_request_timeout_seconds)
    started_at = perf_counter()
    try:
        response = await client.audio.speech.create(
            model=llm_settings.tts_model,
            voice=llm_settings.tts_voice,
            input=text,
            instructions=_TTS_INSTRUCTIONS,
            response_format="mp3",
        )
    except (APIConnectionError, APIStatusError, OpenAIError) as exc:
        logger.exception("Text-to-speech synthesis failed")
        raise AppError(f"Couldn't generate audio: {exc}") from exc
    finally:
        await client.close()

    latency_ms = int((perf_counter() - started_at) * 1000)
    await log_openai_audio_usage_async(
        settings=llm_settings,
        model=llm_settings.tts_model,
        text=text,
        latency_ms=latency_ms,
        operation="tts_speech",
        user_id=user_id,
    )

    return response.content
