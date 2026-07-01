"""Google Gemini provider.

The Gemini SDK is imported lazily inside methods so that:
* importing this module never fails if the SDK is not installed, and
* the app can boot (and tests can run) without the ``google-generativeai``
  package or an API key.
"""

from __future__ import annotations

from collections.abc import Iterator

from app.llm.base import LLMMessage, LLMProvider


def _to_gemini_contents(messages: list[LLMMessage]) -> list[dict]:
    """Map generic messages to Gemini's ``contents`` structure.

    Gemini uses roles ``"user"`` and ``"model"``; system text is passed
    separately via ``system_instruction``.
    """
    contents: list[dict] = []
    for message in messages:
        if message.role == "system":
            continue  # handled via system_instruction
        role = "model" if message.role == "assistant" else "user"
        contents.append({"role": role, "parts": [message.content]})
    return contents


class GeminiProvider(LLMProvider):
    def __init__(self, api_key: str, model: str) -> None:
        if not api_key:
            raise RuntimeError("GEMINI_API_KEY is not configured.")
        self._api_key = api_key
        self._model_name = model
        self._genai = None  # lazily configured SDK module

    def _sdk(self):
        if self._genai is None:
            import google.generativeai as genai  # lazy import

            genai.configure(api_key=self._api_key)
            self._genai = genai
        return self._genai

    def _build_model(self, system: str | None):
        genai = self._sdk()
        return genai.GenerativeModel(self._model_name, system_instruction=system)

    @staticmethod
    def _gen_config(temperature: float, max_tokens: int | None) -> dict:
        config: dict = {"temperature": temperature}
        if max_tokens is not None:
            config["max_output_tokens"] = max_tokens
        return config

    def generate(
        self,
        messages: list[LLMMessage],
        *,
        system: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
    ) -> str:
        model = self._build_model(system)
        response = model.generate_content(
            _to_gemini_contents(messages),
            generation_config=self._gen_config(temperature, max_tokens),
        )
        return (getattr(response, "text", "") or "").strip()

    def generate_stream(
        self,
        messages: list[LLMMessage],
        *,
        system: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
    ) -> Iterator[str]:
        model = self._build_model(system)
        stream = model.generate_content(
            _to_gemini_contents(messages),
            generation_config=self._gen_config(temperature, max_tokens),
            stream=True,
        )
        for chunk in stream:
            text = getattr(chunk, "text", "") or ""
            if text:
                yield text
