from fastapi import APIRouter

from app.api.control import router as control_router
from app.api.database import router as database_router
from app.api.git import router as git_router
from app.api.logs import router as logs_router

api_router = APIRouter()
api_router.include_router(control_router)
api_router.include_router(database_router)
api_router.include_router(git_router)
api_router.include_router(logs_router)
