from fastapi import APIRouter

from app.api import (
    auth,
    goals,
    milestones,
    tasks,
)

api_router = APIRouter()

for _module in (
    auth,
    goals,
    milestones,
    tasks,
):
    api_router.include_router(_module.router)