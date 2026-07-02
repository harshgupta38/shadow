"""Aggregate every feature router under a single ``api_router``.

Included in ``app.main`` with the ``/api`` prefix.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.api import (
    auth,
    chat,
    dashboard,
    goals,
    journal,
    metrics,
    milestones,
    notifications,
    onboarding,
    plan,
    profile,
    reports,
    settings,
)

api_router = APIRouter()

for _module in (
    auth,
    onboarding,
    profile,
    settings,
    goals,
    milestones,
    chat,
    journal,
    notifications,
    metrics,
    plan,
    reports,
    dashboard,
):
    api_router.include_router(_module.router)
