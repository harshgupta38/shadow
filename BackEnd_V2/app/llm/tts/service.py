"""Text-to-speech for the Daily Brief "Listen" feature.

Uses OpenAI's audio API directly (not the pluggable LLMProvider abstraction —
audio synthesis isn't implemented across every provider, and this is the only
caller today).
"""
import io
import logging
from time import perf_counter

from openai import AsyncOpenAI, APIConnectionError, APIStatusError, OpenAIError

from app.analysis.llm_usage_logger import log_openai_audio_usage_async, log_openai_transcription_usage_async
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


async def transcribe_word_timings(audio_bytes: bytes, *, user_id: int) -> list[dict] | None:
    """Transcribes our own just-generated audio to get real per-word timestamps
    for caption sync — this is ground truth (it's the exact audio being played),
    not a guess from the source text. Best-effort: captions are a nice-to-have,
    so any failure here must never break audio playback."""
    if not llm_settings.openai_api_key:
        return None

    client = AsyncOpenAI(api_key=llm_settings.openai_api_key, timeout=llm_settings.llm_request_timeout_seconds)
    started_at = perf_counter()
    try:
        transcript = await client.audio.transcriptions.create(
            model="whisper-1",
            file=("brief.mp3", io.BytesIO(audio_bytes), "audio/mpeg"),
            response_format="verbose_json",
            timestamp_granularities=["word"],
        )
        words = getattr(transcript, "words", None) or []
        latency_ms = int((perf_counter() - started_at) * 1000)
        # whisper-1 is billed per audio-minute, not per token — transcript.usage.seconds
        # is the authoritative billed duration (falls back if usage is ever missing).
        # `or`-chaining would wrongly skip a legitimate 0.0 value, so check explicitly.
        usage = getattr(transcript, "usage", None)
        usage_seconds = getattr(usage, "seconds", None)
        transcript_duration = getattr(transcript, "duration", None)
        if usage_seconds is not None:
            duration_seconds = usage_seconds
        elif transcript_duration is not None:
            duration_seconds = transcript_duration
        else:
            duration_seconds = words[-1].end if words else 0.0
        await log_openai_transcription_usage_async(
            settings=llm_settings,
            model="whisper-1",
            duration_seconds=duration_seconds,
            latency_ms=latency_ms,
            operation="tts_word_timings",
            user_id=user_id,
        )
        return [{"word": w.word, "start": w.start, "end": w.end} for w in words]
    except (APIConnectionError, APIStatusError, OpenAIError):
        logger.warning("Word-timing transcription failed — captions will be unavailable.", exc_info=True)
        return None
    finally:
        await client.close()
