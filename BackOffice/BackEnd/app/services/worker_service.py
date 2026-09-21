"""Real process/host introspection for the Server page — reads the same
machine BackEnd_V2 runs on (BackOffice is co-located), so these are actual
measurements, not simulated data.

Every function here degrades gracefully instead of raising: a misconfigured
SHADOW_BACKEND_DIR, a missing arbiter process, or termux-api not being
installed should each only blank out their own piece of the health response,
never take down the whole /server/health endpoint. Failures are logged
rather than swallowed silently, though — a metric quietly going blank in
production with no trace of why is its own kind of bug.
"""

import json
import logging
import os
import subprocess
import time
from pathlib import Path
from urllib.parse import urlparse

import psutil

from app.core.config import settings

logger = logging.getLogger(__name__)


def _backend_dir() -> Path:
    return Path(settings.shadow_backend_dir).expanduser()


def _backend_port() -> int:
    return urlparse(settings.shadow_backend_url).port or 8000


def _find_arbiter() -> psutil.Process | None:
    """Finds BackEnd_V2's uvicorn arbiter by matching its actual command
    line — the same information restart_server.sh uses to launch it in
    the first place, so there's nothing else (a pidfile path, or
    process-group inheritance surviving setsid/nohup/multiprocessing's
    spawn intact) that needs to independently agree for this to work.
    Matched on port specifically: BackOffice's own arbiter is also
    "uvicorn app.main:app", co-located on the same device — the port is
    what actually tells the two apart.
    """
    port_marker = f"--port {_backend_port()}"
    for proc in psutil.process_iter(["pid", "cmdline"]):
        try:
            cmdline = " ".join(proc.info["cmdline"] or [])
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
        if "uvicorn" in cmdline and "app.main:app" in cmdline and port_marker in cmdline:
            try:
                return psutil.Process(proc.info["pid"])
            except psutil.NoSuchProcess:
                return None
    return None


def get_workers() -> list[dict]:
    """The uvicorn arbiter plus every worker it forked — found via
    psutil's own process tree (arbiter.children()), which works
    identically on every platform, rather than process-group membership.
    The group-based approach this replaced depended on a pidfile pointing
    at a real running arbiter AND on setsid/nohup/multiprocessing's spawn
    preserving process-group inheritance exactly as expected; if either
    broke, it silently reported zero workers with no way to tell why.
    Parent/child is a far more direct relationship with nothing else that
    needs to independently agree.
    """
    arbiter = _find_arbiter()
    if arbiter is None:
        logger.warning("worker_service: no BackEnd_V2 uvicorn arbiter found on port %s.", _backend_port())
        return []

    try:
        children = arbiter.children(recursive=True)
    except psutil.NoSuchProcess:
        return []

    workers: list[dict] = []
    for proc in [arbiter, *children]:
        try:
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
        logger.exception("worker_service: psutil.cpu_percent() failed.")
        return None


def _load_average() -> list[float] | None:
    """1/5/15-minute load average — a second, independent "how busy is
    this host" signal alongside cpu_percent (reads /proc/loadavg
    directly rather than psutil's own sampling), so a device where one
    of the two doesn't work for some platform-specific reason isn't left
    with no CPU signal at all."""
    try:
        return [round(x, 2) for x in os.getloadavg()]
    except (OSError, AttributeError):
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
        "load_average": _load_average(),
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


def get_wifi_info() -> dict | None:
    """Real WiFi connection info via Termux:API — a server that runs on a
    phone can go offline because it lost its network, not just because a
    process died, so this is a genuinely different failure mode from
    everything else on this page. Deliberately called directly here
    (not through BackEnd_V2's own API) for the same reason get_battery()
    is: if BackEnd_V2 itself is unreachable, this is exactly the kind of
    thing that might tell you why, so it can't depend on BackEnd_V2 being
    up to report it. Returns None if termux-api isn't installed, the call
    fails, or the device isn't on WiFi at all (mobile data / no
    connection) — the response's own supplicant_state would say
    "DISCONNECTED" rather than the call failing outright, so the caller
    checks that too.
    """
    try:
        data = json.loads(subprocess.check_output(["termux-wifi-connectioninfo"], timeout=5))
    except Exception:
        return None
    if data.get("supplicant_state") != "COMPLETED":
        return None
    return data
