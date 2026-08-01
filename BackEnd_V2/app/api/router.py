from fastapi import APIRouter

from app.api import (
    auth,
    onboarding,
)

api_router = APIRouter()

for _module in (
    auth,
    onboarding,
):
    api_router.include_router(_module.router)