from fastapi import APIRouter

from app.api import (
    appearance,
    auth,
    chat,
    dashboard,
    goals,
    habits,
    milestones,
    notifications,
    planner,
    reports,
    schedule,
    tasks,
    track_progress,
)

api_router = APIRouter()

for _module in (
    appearance,
    auth,
    chat,
    dashboard,
    goals,
    habits,
    milestones,
    notifications,
    planner,
    reports,
    schedule,
    tasks,
    track_progress,
):
    api_router.include_router(_module.router)