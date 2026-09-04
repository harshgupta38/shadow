"""Google Gemini provider.

The Gemini SDK is imported lazily inside methods so that:
* importing this module never fails if the SDK is not installed, and
* the app can boot (and tests can run) without the ``google-genai``
    package or an API key.
"""

from __future__ import annotations

from collections.abc import Iterator
import logging
from typing import Any

from app.llm.base import LLMMessage, LLMProvider

logger = logging.getLogger(__name__)


def _to_gemini_contents(messages: list[LLMMessage]) -> list[dict[str, Any]]:
    """Map generic messages to Gemini's ``contents`` structure.

    ``google-genai`` accepts role/content dictionaries where role is either
    ``"user"`` or ``"model"``. System text is passed separately in config.
    """
    contents: list[dict[str, Any]] = []
    for message in messages:
        if message.role == "system":
            continue
        role = "model" if message.role == "assistant" else "user"
        contents.append({"role": role, "parts": [{"text": message.content}]})
    return contents


class GeminiProvider(LLMProvider):
    def __init__(self, api_key: str, model: str) -> None:
        if not api_key:
            raise RuntimeError("GEMINI_API_KEY is not configured.")
        self._api_key = api_key
        self._model_name = model
        self._client = None  # lazily configured SDK client

    def _sdk(self):
        if self._client is None:
            from google import genai  # lazy import

            self._client = genai.Client(api_key=self._api_key)
        return self._client

    def _resolve_model_name(self, model: str | None) -> str:
        candidate = (model or "").strip()
        return candidate or self._model_name

    @staticmethod
    def _gen_config(system: str | None, temperature: float, max_tokens: int | None) -> dict[str, Any]:
        config: dict[str, Any] = {"temperature": temperature}
        if max_tokens is not None:
            config["max_output_tokens"] = max_tokens
        if system:
            config["system_instruction"] = system
        return config

    @staticmethod
    def _response_text(response: Any) -> str:
        text = getattr(response, "text", None)
        if text:
            return str(text).strip()

        candidates = getattr(response, "candidates", None) or []
        chunks: list[str] = []
        for candidate in candidates:
            content = getattr(candidate, "content", None)
            parts = getattr(content, "parts", None) if content is not None else None
            for part in parts or []:
                part_text = getattr(part, "text", None)
                if part_text:
                    chunks.append(str(part_text))
        return "".join(chunks).strip()

    def generate(
        self,
        messages: list[LLMMessage],
        *,
        system: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
        model: str | None = None,
    ) -> str:
        client = self._sdk()
        chosen_model = self._resolve_model_name(model)
        try:
            response = client.models.generate_content(
                model=chosen_model,
                contents=_to_gemini_contents(messages),
                config=self._gen_config(system, temperature, max_tokens),
            )
        except Exception:
            if model and chosen_model != self._model_name:
                logger.warning(
                    "Gemini model override '%s' failed; falling back to default model '%s'.",
                    chosen_model,
                    self._model_name,
                )
                response = client.models.generate_content(
                    model=self._model_name,
                    contents=_to_gemini_contents(messages),
                    config=self._gen_config(system, temperature, max_tokens),
                )
            else:
                raise
        return self._response_text(response)

    def generate_stream(
        self,
        messages: list[LLMMessage],
        *,
        system: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
        model: str | None = None,
    ) -> Iterator[str]:
        client = self._sdk()
        chosen_model = self._resolve_model_name(model)
        try:
            stream = client.models.generate_content_stream(
                model=chosen_model,
                contents=_to_gemini_contents(messages),
                config=self._gen_config(system, temperature, max_tokens),
            )
        except Exception:
            if model and chosen_model != self._model_name:
                logger.warning(
                    "Gemini stream model override '%s' failed; falling back to default model '%s'.",
                    chosen_model,
                    self._model_name,
                )
                stream = client.models.generate_content_stream(
                    model=self._model_name,
                    contents=_to_gemini_contents(messages),
                    config=self._gen_config(system, temperature, max_tokens),
                )
            else:
                raise
        for chunk in stream:
            text = getattr(chunk, "text", None) or self._response_text(chunk)
            if text:
                yield text
