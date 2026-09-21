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

# Confirmed in production: this device permission-denies reads of the
# system-wide /proc/stat (psutil.cpu_percent() and Process.create_time(),
# via boot_time(), both need it), while per-process /proc/<pid>/* files
# stay readable. That's a fixed fact about this device, not a transient
# hiccup — once observed, retrying it on every health push (every few
# seconds, now that this is a live WebSocket feed rather than an
# occasional poll) would mean a wasted syscall AND a logged traceback
# forever for something that will never succeed. This is checked before
# every /proc/stat-dependent call below and only re-attempted this
# rarely, in case the restriction is ever lifted (a permission grant, a
# device change) without a full restart.
_PROC_STAT_RETRY_COOLDOWN_S = 300
_proc_stat_blocked_until = 0.0


def _proc_stat_available() -> bool:
    return time.monotonic() >= _proc_stat_blocked_until


def _mark_proc_stat_blocked(source: str) -> None:
    global _proc_stat_blocked_until
    if _proc_stat_available():  # only log the transition, not every tick it stays blocked
        logger.warning(
            "worker_service: /proc/stat is permission-denied on this device (seen via %s) — "
            "skipping calls that need it for the next %ds instead of retrying every tick.",
            source, _PROC_STAT_RETRY_COOLDOWN_S,
        )
    _proc_stat_blocked_until = time.monotonic() + _PROC_STAT_RETRY_COOLDOWN_S


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
            return proc  # already a live psutil.Process from this same iteration — no need to re-look-up by pid
    return None


def _ppid_map() -> dict[int, int]:
    """pid -> ppid for every process on the system, read directly rather
    than through psutil.Process.children() — confirmed in production
    that call raises psutil.AccessDenied here, because it internally
    verifies each candidate via create_time(), which needs boot_time()
    (a *system-wide* read of /proc/stat). /proc/stat is permission-denied
    on this Termux/Android setup, even though the per-process files this
    function itself relies on (each pid's own /proc/<pid>/stat) still
    work fine."""
    mapping: dict[int, int] = {}
    for proc in psutil.process_iter(["pid", "ppid"]):
        try:
            mapping[proc.info["pid"]] = proc.info["ppid"]
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
    return mapping


def _descendant_pids(root_pid: int, ppid_map: dict[int, int]) -> set[int]:
    """Every pid whose ppid chain eventually leads back to root_pid — a
    plain fixed-point search over the ppid map, equivalent to
    Process.children(recursive=True) but without its internal
    create_time()-based verification step."""
    result = {root_pid}
    changed = True
    while changed:
        changed = False
        for pid, ppid in ppid_map.items():
            if ppid in result and pid not in result:
                result.add(pid)
                changed = True
    return result


def _safe_metric(fn):
    """Runs one single metric lookup, never letting it take the others
    down with it — confirmed necessary in production: create_time() (and
    therefore uptime_seconds) can fail with AccessDenied on a device
    where cpu_percent() or memory_info() still work fine, or vice versa,
    depending on exactly which /proc file that device restricts."""
    try:
        return fn()
    except (psutil.NoSuchProcess, psutil.AccessDenied, ProcessLookupError, OSError):
        return None


def _worker_uptime(proc: psutil.Process) -> int | None:
    """create_time() needs boot_time(), a /proc/stat read — gated behind
    the circuit breaker above so a device that denies it isn't hit with
    this same doomed attempt for every worker, on every tick, forever."""
    if not _proc_stat_available():
        return None
    try:
        return int(time.time() - proc.create_time())
    except psutil.AccessDenied:
        _mark_proc_stat_blocked("Process.create_time")
        return None
    except (psutil.NoSuchProcess, ProcessLookupError, OSError):
        return None


def get_workers() -> list[dict]:
    """Every worker the uvicorn arbiter forked — found via a manual
    pid/ppid walk (see _descendant_pids), not psutil's own
    Process.children(), and not process-group membership either. Both of
    those alternatives depended on something that turned out to be
    unreliable in practice: process groups needed a pidfile pointing at a
    real running arbiter *and* setsid/nohup/multiprocessing's spawn
    preserving group inheritance exactly right; children() needs
    create_time(), which 500'd this whole endpoint in production because
    it needs a /proc/stat read this device denies. Every metric below
    fails independently for the same reason — a worker whose CPU% can't
    be read should still show up with its PID and whatever else worked.

    The arbiter's own pid is deliberately excluded from the result:
    confirmed locally (a real `--workers N` process tree) that it's a
    supervisor which manages the N worker processes but never serves a
    request itself, so counting it as one more "worker" made a perfectly
    healthy server show up as e.g. "5 of 4" against expected_workers.
    """
    arbiter = _find_arbiter()
    if arbiter is None:
        logger.warning("worker_service: no BackEnd_V2 uvicorn arbiter found on port %s.", _backend_port())
        return []

    pids = _descendant_pids(arbiter.pid, _ppid_map()) - {arbiter.pid}

    workers: list[dict] = []
    for pid in pids:
        try:
            proc = psutil.Process(pid)
        except psutil.NoSuchProcess:
            continue
        cpu = _safe_metric(lambda p=proc: round(p.cpu_percent(interval=0.1), 1))
        mem_mb = _safe_metric(lambda p=proc: round(p.memory_info().rss / (1024 * 1024), 1))
        uptime = _worker_uptime(proc)
        workers.append({
            "pid": pid,
            "cpu_percent": cpu,
            "memory_mb": mem_mb,
            "uptime_seconds": uptime,
        })

    workers.sort(key=lambda w: (w["uptime_seconds"] is None, -(w["uptime_seconds"] or 0)))
    return workers


def _cpu_percent() -> float | None:
    if not _proc_stat_available():
        return None
    try:
        return psutil.cpu_percent(interval=0.3)
    except PermissionError:
        _mark_proc_stat_blocked("cpu_percent")
        return None
    except Exception:
        logger.exception("worker_service: psutil.cpu_percent() failed.")
        return None


_loadavg_logged_failure = False


def _load_average() -> list[float] | None:
    """1/5/15-minute load average — a second, independent "how busy is
    this host" signal alongside cpu_percent (reads /proc/loadavg
    directly rather than psutil's own sampling), so a device where one
    of the two doesn't work for some platform-specific reason isn't left
    with no CPU signal at all. Unlike /proc/stat above, this isn't yet
    confirmed to fail on any real device — so this only logs once
    (rather than a full time-based cooldown) to find out if it ever does,
    without spamming the log every 5-second tick forever if it turns out
    to be permanent too."""
    global _loadavg_logged_failure
    try:
        return [round(x, 2) for x in os.getloadavg()]
    except (OSError, AttributeError):
        if not _loadavg_logged_failure:
            logger.exception("worker_service: os.getloadavg() failed (logged once only).")
            _loadavg_logged_failure = True
        return None


def _memory_stats_from_proc_meminfo() -> dict:
    """Direct /proc/meminfo parse — a fallback for the case where
    psutil.virtual_memory() itself fails, even though it already reads
    this same file under the hood on Linux. /proc/meminfo is a different
    file from /proc/stat (the one confirmed permission-denied on this
    device) with its own, looser permissions on typical Android/Termux
    setups, so it isn't expected to inherit that restriction — this just
    makes memory reporting resilient to psutil failing for some other
    reason too (a version quirk, anything), not only the one already
    diagnosed."""
    try:
        fields: dict[str, int] = {}
        with open("/proc/meminfo", encoding="utf-8") as f:
            for line in f:
                key, _, rest = line.partition(":")
                parts = rest.strip().split()
                if key and parts:
                    fields[key] = int(parts[0])  # value is in kB, e.g. "123456 kB"

        total_kb = fields.get("MemTotal", 0)
        available_kb = fields.get("MemAvailable", fields.get("MemFree", 0))
        if total_kb <= 0:
            return {"memory_used_mb": None, "memory_total_mb": None, "memory_percent": None}

        used_kb = total_kb - available_kb
        return {
            "memory_used_mb": round(used_kb / 1024, 1),
            "memory_total_mb": round(total_kb / 1024, 1),
            "memory_percent": round(used_kb / total_kb * 100, 1),
        }
    except Exception:
        logger.exception("worker_service: /proc/meminfo fallback also failed.")
        return {"memory_used_mb": None, "memory_total_mb": None, "memory_percent": None}


def _memory_stats() -> dict:
    try:
        vm = psutil.virtual_memory()
        return {
            "memory_used_mb": round(vm.used / (1024 * 1024), 1),
            "memory_total_mb": round(vm.total / (1024 * 1024), 1),
            "memory_percent": vm.percent,
        }
    except Exception:
        logger.exception("worker_service: psutil.virtual_memory() failed, falling back to /proc/meminfo directly.")
        return _memory_stats_from_proc_meminfo()


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
        logger.exception("worker_service: termux-battery-status failed.")
        return None


# WiFi info was removed — termux-wifi-connectioninfo returns an empty
# JSON object on the actual device, with no supplicant_state or any
# other usable field, so there was nothing real to show. Likely the
# Termux:API app is missing the location permission Android requires
# for this specific call (a different restriction from the /proc/stat
# denial above); either way, confirmed not obtainable here.
