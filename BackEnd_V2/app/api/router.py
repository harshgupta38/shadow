from fastapi import APIRouter

from app.api import (
    auth,
    chat,
    goals,
    habits,
    milestones,
    plan_items,
    tasks,
)

api_router = APIRouter()

for _module in (
    auth,
    chat,
    goals,
    habits,
    milestones,
    plan_items,
    tasks,
):
    api_router.include_router(_module.router)