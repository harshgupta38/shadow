from fastapi import APIRouter

from app.api import (
    auth,
    chat,
    goals,
    habits,
    milestones,
    planner,
    reports,
    schedule,
    tasks,
    track_progress,
)

api_router = APIRouter()

for _module in (
    auth,
    chat,
    goals,
    habits,
    milestones,
    planner,
    reports,
    schedule,
    tasks,
    track_progress,
):
    api_router.include_router(_module.router)