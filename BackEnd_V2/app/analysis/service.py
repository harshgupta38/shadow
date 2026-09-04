from __future__ import annotations

import asyncio
import logging
from functools import lru_cache

from app.analysis.config import AnalysisSettings, analysis_settings
from app.analysis.google_sheets import GoogleSheetsAnalysisClient
from app.analysis.models import LLMUsageRecord

logger = logging.getLogger(__name__)


class AnalysisService:
    def __init__(
        self,
        settings: AnalysisSettings | None = None,
        client: GoogleSheetsAnalysisClient | None = None,
    ) -> None:
        self._settings = settings or analysis_settings
        self._client = client or GoogleSheetsAnalysisClient(self._settings)

    @property
    def enabled(self) -> bool:
        return self._settings.analysis_enabled

    async def log_llm_usage(self, record: LLMUsageRecord) -> None:
        if not self.enabled:
            return

        try:
            await asyncio.to_thread(self._client.append_llm_usage, record)
        except Exception:
            logger.exception("Failed to write LLM usage analytics to Google Sheets.")


@lru_cache(maxsize=1)
def get_analysis_service() -> AnalysisService:
    return AnalysisService()
