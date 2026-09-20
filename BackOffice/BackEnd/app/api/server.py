from fastapi import APIRouter, BackgroundTasks
from fastapi.responses import PlainTextResponse

from app.api.deps import CurrentAdmin, DbSession
from app.core.endpoints import ENDPOINTS
from app.core.exceptions import NotFoundError
from app.models.restart_log import RestartLogDBM
from app.schemas.server import RestartResponse, ServerHealthResponse
from app.services import restart_service, shadow_client, worker_service

router = APIRouter(prefix=ENDPOINTS.SERVER.PREFIX, tags=["Server"])


@router.get(ENDPOINTS.SERVER.HEALTH, response_model=ServerHealthResponse)
def get_health(_admin: CurrentAdmin):
    shadow_health = shadow_client.check_health()
    host = worker_service.get_host_stats()
    battery = worker_service.get_battery() or {}
    workers = worker_service.get_workers()

    return ServerHealthResponse(
        reachable=shadow_health is not None,
        message=(shadow_health or {}).get("message"),
        battery_percent=battery.get("percentage"),
        battery_status=battery.get("status"),
        battery_temperature_c=battery.get("temperature"),
        workers=workers,
        **host,
    )


@router.get(ENDPOINTS.SERVER.WORKERS)
def get_workers(_admin: CurrentAdmin):
    return worker_service.get_workers()


@router.get(ENDPOINTS.SERVER.LOG, response_class=PlainTextResponse)
def get_log(_admin: CurrentAdmin, lines: int = 200):
    return shadow_client.fetch_server_log(lines)


@router.get(ENDPOINTS.SERVER.RESTART_HISTORY, response_model=list[RestartResponse])
def get_restart_history(db: DbSession, _admin: CurrentAdmin, page: int = 1, page_size: int = 10):
    offset = max(page - 1, 0) * page_size
    return (
        db.query(RestartLogDBM)
        .order_by(RestartLogDBM.started_at.desc())
        .offset(offset)
        .limit(page_size)
        .all()
    )


@router.post(ENDPOINTS.SERVER.RESTART, response_model=RestartResponse)
def restart(background_tasks: BackgroundTasks, db: DbSession, admin: CurrentAdmin):
    log = restart_service.create_restart_record(db, admin.email)
    background_tasks.add_task(restart_service.run_restart_job, log.id)
    return log


@router.get(ENDPOINTS.SERVER.RESTART_DETAIL, response_model=RestartResponse)
def get_restart(restart_id: int, db: DbSession, _admin: CurrentAdmin):
    log = db.get(RestartLogDBM, restart_id)
    if log is None:
        raise NotFoundError("Restart record not found.")
    return log
