from fastapi import APIRouter

from app.api import (
    auth
)

api_router = APIRouter()

for _module in (
    auth,
):
    api_router.include_router(_module.router)