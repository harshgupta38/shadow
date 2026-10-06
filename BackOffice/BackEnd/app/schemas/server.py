from datetime import datetime

from pydantic import BaseModel, ConfigDict


class WorkerInfo(BaseModel):
    pid: int
    # Each of these can fail independently (confirmed in production —
    # some /proc reads are permission-denied on some Termux/Android
    # setups) — a worker still shows up with its PID even if none of its
    # other metrics could be read.
    cpu_percent: float | None
    memory_mb: float | None
    uptime_seconds: int | None


class ServerHealthResponse(BaseModel):
    reachable: bool
    message: str | None = None

    cpu_percent: float | None = None
    # [1min, 5min, 15min] load average — a second, independent CPU signal
    # (reads /proc/loadavg directly) alongside cpu_percent above.
    load_average: list[float] | None = None
    memory_used_mb: float | None = None
    memory_total_mb: float | None = None
    memory_percent: float | None = None
    disk_used_gb: float | None = None
    disk_total_gb: float | None = None
    disk_percent: float | None = None

    battery_percent: int | None = None
    battery_status: str | None = None
    battery_temperature_c: float | None = None
    battery_plugged: str | None = None

    workers: list[WorkerInfo] = []
    # The uvicorn arbiter's own --workers flag (BackEnd_V2's config, via
    # /health) — compared against len(workers) above (this process's own
    # psutil count) to tell "fewer workers than intended" apart from
    # "this server only ever runs N."
    expected_workers: int | None = None
    # Computed from BackOffice's own restart history, not measured
    # directly — see restart_service.get_server_uptime_seconds for why
    # (psutil.Process.create_time() is confirmed permission-denied on at
    # least one real device).
    server_uptime_seconds: int | None = None


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
