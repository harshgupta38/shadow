from fastapi import APIRouter, Depends

from app.api import (
    appearance,
    auth,
    chat,
    dashboard,
    daily_brief,
    goals,
    habits,
    milestones,
    notifications,
    planner,
    profile,
    reports,
    schedule,
    settings,
    tasks,
    track_progress,
)
from app.api.deps import require_device_limit_resolved

api_router = APIRouter()

# Auth and settings are exempt: the device-limit page must be able to list/revoke
# sessions and adjust the limit without getting blocked by its own guard.
_DEVICE_LIMIT_EXEMPT = {auth, settings}
_device_limit_dep = [Depends(require_device_limit_resolved)]

for _module in (
    appearance,
    auth,
    chat,
    dashboard,
    daily_brief,
    goals,
    habits,
    milestones,
    notifications,
    planner,
    profile,
    reports,
    schedule,
    settings,
    tasks,
    track_progress,
):
    kwargs = {} if _module in _DEVICE_LIMIT_EXEMPT else {"dependencies": _device_limit_dep}
    api_router.include_router(_module.router, **kwargs)