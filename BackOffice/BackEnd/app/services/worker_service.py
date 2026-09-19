"""Real process/host introspection for the Server page — reads the same
machine BackEnd_V2 runs on (BackOffice is co-located), so these are actual
measurements, not simulated data.

Every function here degrades gracefully instead of raising: a misconfigured
SHADOW_BACKEND_DIR, a platform without os.getpgid, or termux-api not being
installed should each only blank out their own piece of the health response,
never take down the whole /server/health endpoint.
"""

import json
import os
import subprocess
import time
from pathlib import Path

import psutil

from app.core.config import settings


def _backend_dir() -> Path:
    return Path(settings.shadow_backend_dir).expanduser()


def _pid_file() -> Path:
    return _backend_dir() / "server.pid"


def get_process_group_id() -> int | None:
    """restart_server.sh stores the uvicorn arbiter's PGID here (see its
    comment on why process-group kill is required for --workers N)."""
    pid_file = _pid_file()
    if not pid_file.exists():
        return None
    try:
        return int(pid_file.read_text().strip())
    except (ValueError, OSError):
        return None


def get_workers() -> list[dict]:
    """Every process sharing BackEnd_V2's process group — the arbiter plus
    its forked workers. Returns [] if server.pid is missing/stale, or if
    process-group lookups aren't supported on this platform (os.getpgid is
    POSIX-only; production is Termux/Linux, but this shouldn't crash a local
    Windows/macOS dev run either).
    """
    pgid = get_process_group_id()
    if pgid is None or not hasattr(os, "getpgid"):
        return []

    workers: list[dict] = []
    for proc in psutil.process_iter(["pid"]):
        try:
            if os.getpgid(proc.pid) != pgid:
                continue
            cpu = proc.cpu_percent(interval=0.1)
            mem_mb = proc.memory_info().rss / (1024 * 1024)
            uptime = time.time() - proc.create_time()
            workers.append({
                "pid": proc.pid,
                "cpu_percent": round(cpu, 1),
                "memory_mb": round(mem_mb, 1),
                "uptime_seconds": int(uptime),
            })
        except (psutil.NoSuchProcess, psutil.AccessDenied, ProcessLookupError, OSError):
            continue

    workers.sort(key=lambda w: w["uptime_seconds"], reverse=True)
    return workers


def _cpu_percent() -> float | None:
    try:
        return psutil.cpu_percent(interval=0.3)
    except Exception:
        return None


def _memory_stats() -> dict:
    try:
        vm = psutil.virtual_memory()
        return {
            "memory_used_mb": round(vm.used / (1024 * 1024), 1),
            "memory_total_mb": round(vm.total / (1024 * 1024), 1),
            "memory_percent": vm.percent,
        }
    except Exception:
        return {"memory_used_mb": None, "memory_total_mb": None, "memory_percent": None}


def _disk_stats() -> dict:
    # Prefer the configured backend directory (same disk BackEnd_V2/shadow.db
    # live on); fall back to the home directory, then give up gracefully —
    # a bad SHADOW_BACKEND_DIR should blank these fields, not 500 the page.
    for candidate in (_backend_dir(), Path.home()):
        try:
            du = psutil.disk_usage(str(candidate))
            return {
                "disk_used_gb": round(du.used / (1024 ** 3), 1),
                "disk_total_gb": round(du.total / (1024 ** 3), 1),
                "disk_percent": du.percent,
            }
        except Exception:
            continue
    return {"disk_used_gb": None, "disk_total_gb": None, "disk_percent": None}


def get_host_stats() -> dict:
    """System-wide (not per-process) CPU/memory/disk for the machine
    BackEnd_V2 runs on. Each metric fails independently."""
    return {
        "cpu_percent": _cpu_percent(),
        **_memory_stats(),
        **_disk_stats(),
    }


def get_battery() -> dict | None:
    """Real battery info via Termux:API — same mechanism BackEnd_V2's
    system.py already uses (_get_battery). Returns None (not fake numbers)
    if termux-api isn't installed or the call fails.
    """
    try:
        data = subprocess.check_output(["termux-battery-status"], timeout=5)
        return json.loads(data)
    except Exception:
        return None
