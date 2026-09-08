import os
from pathlib import Path
from typing import IO

_held_locks: dict[str, IO] = {}  # kept open for the process lifetime, keyed by lock name


def acquire_singleton_lock(name: str) -> bool:
    """Try to become the one process running a job identified by `name`. Returns True if acquired.

    Uses an OS-level exclusive flock on Linux/Android so the lock is
    automatically released if the process dies — no stale lock files.
    On Windows (local dev, always single-worker) fcntl is unavailable so
    we skip locking — ImportError is the cross-platform signal.
    """
    try:
        import fcntl
    except ImportError:
        return True  # Windows — single worker assumed, no lock needed

    try:
        fh = open(Path(f".{name}.lock"), "w")
        fcntl.flock(fh, fcntl.LOCK_EX | fcntl.LOCK_NB)
        fh.write(str(os.getpid()))
        fh.flush()
        _held_locks[name] = fh  # hold open — OS releases lock when this process exits
        return True
    except OSError:
        return False
