"""Identity of this running BackOffice process.

A new process means a restart actually happened, which a bare "the API answers again" can't prove
(the same process may just have been slow). /health returns these so the frontend can tell the
instance it was talking to before a restart apart from the one that answers afterwards.

COMMIT and STARTED_AT are what a deploy of BackOffice itself is judged by: a process that started after the request
and runs the expected commit is the evidence the deploy took effect. Both are read once, when this module is imported.
"""
import subprocess
import uuid
from datetime import datetime, timezone
from pathlib import Path

INSTANCE_ID = uuid.uuid4().hex
STARTED_AT = datetime.now(timezone.utc)


def _read_commit(repo_root: Path) -> str | None:
    """The commit checked out under `repo_root`, or None when git cannot say (no git, or no checkout there)."""
    try:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"], cwd=repo_root, capture_output=True, text=True, timeout=5, check=True,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    return result.stdout.strip().lower() or None


# This file is at <repo>/BackOffice/BackEnd/app/core/, so the checkout root is four levels up (as BackEnd_V2's own read).
COMMIT = _read_commit(Path(__file__).resolve().parents[4])
