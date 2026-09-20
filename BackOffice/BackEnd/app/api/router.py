from fastapi import APIRouter

from app.api.auth import router as auth_router
from app.api.database import router as database_router
from app.api.deploy import router as deploy_router
from app.api.server import router as server_router
from app.api.users import router as users_router

api_router = APIRouter()
api_router.include_router(auth_router)
api_router.include_router(deploy_router)
api_router.include_router(database_router)
api_router.include_router(server_router)
api_router.include_router(users_router)
