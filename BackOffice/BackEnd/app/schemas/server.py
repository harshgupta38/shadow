from datetime import datetime

from pydantic import BaseModel, ConfigDict


class WorkerInfo(BaseModel):
    pid: int
    cpu_percent: float
    memory_mb: float
    uptime_seconds: int


class ServerHealthResponse(BaseModel):
    reachable: bool
    message: str | None = None

    cpu_percent: float | None = None
    memory_used_mb: float | None = None
    memory_total_mb: float | None = None
    memory_percent: float | None = None
    disk_used_gb: float | None = None
    disk_total_gb: float | None = None
    disk_percent: float | None = None

    battery_percent: int | None = None
    battery_status: str | None = None
    battery_temperature_c: float | None = None

    workers: list[WorkerInfo] = []


class RestartResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    trigger: str
    initiated_by: str
    status: str
    log_output: str
    started_at: datetime
    completed_at: datetime | None
    duration_seconds: float | None
