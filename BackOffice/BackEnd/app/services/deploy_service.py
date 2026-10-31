"""Deploy/rollback orchestration.

There are no git tags in this repo — releases are just commits merged into
the tracked branch. Every git/restart action is delegated to the Control
Server (Server/, port 9000) over HTTP — BackOffice holds no direct
filesystem or subprocess access to BackEnd_V2's repo, it only calls:

  * "Deploy" = POST /control/main/deploy on the Control Server, which runs
    git fetch/checkout/pull (whatever branch is currently checked out,
    unless a branch is explicitly given) then restart_server.sh.
  * "Rollback" = POST /control/main/rollback with a commit SHA — checks out
    that commit directly (detached HEAD). This is temporary by design: the
    next normal deploy moves the branch back to its tip — it's for
    emergency recovery, not a permanent revert.
  * Commit history / "current commit" = POST /git/main with a whitelisted
    `git log` / `git rev-parse` call — same Control Server, read-only.

A job's verdict comes from what a running process reports about itself, never from "the request went through":

  * Before its request is sent, a job resolves the commit it must end up on (a branch's tip after a fresh fetch,
    or the commit a tag/SHA names) and records it as expected_commit. The row's started_at is the requested time.
  * The Control Server's exit code decides a failure. A 4xx means nothing ran.
  * A process counts only if it started after the request, since the request is what started it. Shadow's /health
    reports its commit and start time; BackOffice reads its own. A deploy succeeds when such a process runs the
    expected commit. A restart succeeds when such a process answers its health check.
  * A restarted process on a different commit is a failure. So is a deploy with no restarted process once the time
    limit has passed. A missing or unreadable answer, a null commit, or a process that started before the request is
    unknown, which is never success.
"""

import json
import logging
import threading
import time
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy.orm import Session

from app.core import instance
from app.core.config import settings
from app.core.exceptions import ConflictError, ServiceUnavailableError
from app.core.timezone import ensure_utc, parse_utc
from app.db.session import SessionLocal, settle_row
from app.models.deployment_log import DeploymentLogDBM
from app.models.restart_log import RestartLogDBM
from app.services import self_restart, shadow_client

logger = logging.getLogger(__name__)

_client = httpx.Client(timeout=90.0)

# The Control Server runs up to three git steps and then the restart script, each with a 60 s limit,
# so the answer to a deploy, rollback or restart can take longer than the default client timeout.
RESTART_CALL_TIMEOUT_S = 300.0
# How long a read of the Control Server may take when open outcomes are reconciled.
RECONCILE_TIMEOUT_S = 3.0
# How long after its request a deploy may wait for a restarted process. The Control Server's steps take at most a few
# minutes, so a process that has not started by then will not start, and the deploy did not take effect.
JOB_TIME_LIMIT = timedelta(minutes=15)
# Reads of the deploy log reconcile at most this often. An open outcome stays open until a process answers, so without
# this every poll would repeat the same round of checks.
RECONCILE_INTERVAL_S = 10.0
# Connection-level failures: the request never reached the Control Server, so nothing ran.
NOT_SENT_ERRORS = (httpx.ConnectError, httpx.ConnectTimeout, httpx.PoolTimeout, httpx.UnsupportedProtocol)

_ROLLBACK_NOTE = (
    "NOTE: this checks out a specific commit in a detached HEAD "
    "state. The next regular deploy will move the branch back to "
    "its latest commit, so this rollback is temporary by design "
    "— it's for emergency recovery, not a permanent revert."
)

_OPEN_LINE = "The outcome is not confirmed yet. It is checked against the running server when the deploy logs are read."

_LABEL = {"shadow": "Shadow", "backoffice": "BackOffice"}

# Serialises the check for a running job against the insert of the next one, so two requests cannot both pass it.
_job_lock = threading.Lock()
_last_reconcile: dict[str, float] = {}


class TargetUnresolved(Exception):
    """The ref cannot be turned into a commit here (or origin cannot be fetched), so nothing is sent to the Control Server."""


def _headers() -> dict:
    return {"X-Control-Secret": settings.control_secret}


def _control_post(path: str, json: dict | None = None, timeout: float | None = None) -> httpx.Response:
    return _client.post(
        f"{settings.control_server_url}{path}",
        json=json,
        headers=_headers(),
        timeout=timeout if timeout is not None else httpx.USE_CLIENT_DEFAULT,
    )


def _control_segment(app: str) -> str:
    return "backoffice" if app == "backoffice" else "main"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def control_json(resp: httpx.Response):
    """The Control Server's JSON body, or None when the answer is not JSON (for example a proxy page)."""
    try:
        return resp.json()
    except ValueError:
        return None


def _rev_parse(app: str, args: list[str], timeout: float | None = None) -> str | None:
    """The full SHA a whitelisted `git rev-parse` prints, or None if git did not resolve it or the
    answer is not the Control Server's own JSON. Raises httpx.RequestError if it is unreachable."""
    resp = _control_post(f"/git/{_control_segment(app)}", {"args": ["rev-parse", *args]}, timeout=timeout)
    data = control_json(resp)
    if resp.status_code != 200 or not isinstance(data, dict) or data.get("returncode") != 0:
        return None
    return str(data.get("stdout", "")).strip().lower() or None


def _current_commit_sha(app: str = "shadow", timeout: float | None = None) -> str | None:
    try:
        return _rev_parse(app, ["HEAD"], timeout)
    except httpx.RequestError:
        return None


def _git_stdout(app: str, args: list[str]) -> str:
    """The stdout of a whitelisted git call. An unreachable or failing Control Server raises, since an empty
    answer would read as "no branches" or "no commits" and hide the failure."""
    try:
        resp = _control_post(f"/git/{_control_segment(app)}", {"args": args})
    except httpx.RequestError as e:
        raise ServiceUnavailableError(f"Could not reach the Control Server to run git {args[0]} ({e}).") from e
    data = control_json(resp)
    if resp.status_code != 200 or not isinstance(data, dict):
        raise ServiceUnavailableError(f"The Control Server could not run git {args[0]} (HTTP {resp.status_code}).")
    if data.get("returncode") != 0:
        raise ServiceUnavailableError(f"git {args[0]} failed on the Control Server: {str(data.get('stderr', '')).strip()}")
    return str(data.get("stdout", ""))


def _current_branch_name(app: str = "shadow") -> str | None:
    """None in a detached HEAD state (right after a rollback, or after
    deploying a tag/commit SHA directly) — `rev-parse --abbrev-ref HEAD`
    then literally returns the string "HEAD", not a real branch, which
    the caller must not show as if it were one."""
    try:
        resp = _control_post(f"/git/{_control_segment(app)}", {"args": ["rev-parse", "--abbrev-ref", "HEAD"]})
    except httpx.RequestError:
        return None
    data = control_json(resp)
    if resp.status_code != 200 or not isinstance(data, dict):
        return None
    branch = str(data.get("stdout", "")).strip()
    return branch if branch and branch != "HEAD" else None


def list_branches(app: str = "shadow") -> dict:
    """Every branch that exists on origin, fetched fresh so one pushed
    moments ago shows up immediately, plus which one (if any) is actually
    checked out right now — the caller shouldn't have to guess or show a
    vague "current branch" placeholder when it can show the real name (or
    a real blank if HEAD is detached and there simply isn't one). `git
    branch -r --format=...` also lists the origin/HEAD symbolic ref, but
    it renders as the bare word "origin" (no slash) with this format
    string rather than "origin/HEAD" — filtering on the "origin/" prefix
    excludes it correctly either way.
    """
    _git_stdout(app, ["fetch", "origin"])
    names = []
    for line in _git_stdout(app, ["branch", "-r", "--format=%(refname:short)"]).splitlines():
        line = line.strip()
        if line.startswith("origin/"):
            names.append(line[len("origin/"):])
    return {"branches": names, "current": _current_branch_name(app)}


def list_recent_commits(limit: int = 10, branch: str | None = None, app: str = "shadow") -> list[dict]:
    """A branch's commit log — the tracked branch's by default, standing in
    for the fictional version tags the UI used to show. `branch` names any
    branch on origin, not just the checked-out one; fetched fresh first so
    switching to a just-pushed branch doesn't show stale history."""
    ref = f"origin/{branch}" if branch else "HEAD"
    if branch:
        _git_stdout(app, ["fetch", "origin"])
    stdout = _git_stdout(app, ["log", ref, f"-{limit}", "--pretty=format:%H|%h|%an|%aI|%s"])

    current = _current_commit_sha(app)
    commits = []
    for line in stdout.splitlines():
        parts = line.split("|", 4)
        if len(parts) != 5:
            continue
        sha, short_sha, author, date, message = parts
        commits.append({
            "sha": sha,
            "short_sha": short_sha,
            "author": author,
            "date": date,
            "message": message,
            "is_current": sha == current,
        })
    return commits


def start_job(db: Session, log, app: str):
    """Records `log` as the app's running job, unless a deploy, rollback or restart of that app is already running.
    Two at once would race on the same checkout. A job started longer ago than JOB_TIME_LIMIT no longer counts, since
    reconcile_unsettled settles it. The check and the insert share one lock, so two requests arriving together cannot
    both pass the check."""
    with _job_lock:
        cutoff = _utcnow().replace(tzinfo=None) - JOB_TIME_LIMIT
        busy = (
            db.query(DeploymentLogDBM.id)
            .filter(DeploymentLogDBM.app == app, DeploymentLogDBM.status == "running", DeploymentLogDBM.started_at >= cutoff)
            .first()
            or db.query(RestartLogDBM.id)
            .filter(RestartLogDBM.app == app, RestartLogDBM.status == "running", RestartLogDBM.started_at >= cutoff)
            .first()
        )
        if busy is not None:
            raise ConflictError(f"A deploy, rollback or restart of {app} is already running. Wait for it to finish.")
        db.add(log)
        db.commit()
        db.refresh(log)
    return log


def create_deployment_record(
    db: Session, git_ref: str, label: str, description: str, triggered_by: str, app: str = "shadow",
) -> DeploymentLogDBM:
    log = DeploymentLogDBM(
        label=label, description=description, app=app, kind="deploy",
        git_ref=git_ref, status="running", triggered_by=triggered_by,
    )
    return start_job(db, log, app)


def _resolve_target(git_ref: str, app: str, allow_branch: bool) -> tuple[bool, str]:
    """What a job must end up on, decided before its request is sent: (is_branch, full commit SHA).

    A branch on origin resolves to its tip after a fresh fetch, which is where the Control Server's pull
    moves the checkout. Anything else (a tag, a commit SHA) resolves to the commit it names. Raises
    TargetUnresolved when the ref names no commit or origin cannot be fetched, and httpx.RequestError if the
    Control Server cannot be reached.
    """
    if git_ref.startswith("-"):  # never let a ref be read as a git option
        raise TargetUnresolved(f"'{git_ref}' does not name a commit.")
    resp = _control_post(f"/git/{_control_segment(app)}", {"args": ["fetch", "origin"]})
    fetched = control_json(resp)
    if resp.status_code != 200 or not isinstance(fetched, dict) or fetched.get("returncode") != 0:
        raise TargetUnresolved(f"Could not fetch origin, so '{git_ref}' could not be resolved to a commit.")
    if allow_branch:
        tip = _rev_parse(app, ["--verify", "--quiet", f"refs/remotes/origin/{git_ref}"])
        if tip:
            return True, tip
    commit = _rev_parse(app, ["--verify", "--quiet", f"{git_ref}^{{commit}}"])
    if commit is None:
        if allow_branch:
            raise TargetUnresolved(f"'{git_ref}' is not a branch on origin and does not name a commit.")
        raise TargetUnresolved(f"'{git_ref}' does not name a commit.")
    return False, commit


def create_rollback_record(db: Session, commit_sha: str, description: str, triggered_by: str, app: str = "shadow") -> DeploymentLogDBM:
    log = DeploymentLogDBM(
        label=f"rollback:{commit_sha[:7]}", description=description, app=app,
        kind="rollback", git_ref=commit_sha, status="running", triggered_by=triggered_by,
    )
    return start_job(db, log, app)


def _append_control_response(lines: list[str], resp: httpx.Response) -> None:
    """Unwraps the Control Server's {"returncode", "output"} JSON body into
    the git/restart transcript it actually contains. Appending resp.text
    directly (the old behavior) showed the raw JSON, with the transcript's
    own newlines escaped as literal backslash-n instead of real line
    breaks — readable as JSON, not as the terminal output it's supposed to
    look like. On a non-2xx response there's no "output" key at all (just
    FastAPI's own {"detail": ...}), which is handled the same way."""
    lines.append(f"control server responded: {resp.status_code}")
    try:
        data = resp.json()
    except ValueError:
        lines.append(resp.text)
        return

    if isinstance(data, dict) and "output" in data:
        lines.append(data["output"])
        if "returncode" in data:
            lines.append(f"(exit code {data['returncode']})")
    elif isinstance(data, dict) and "detail" in data:
        lines.append(str(data["detail"]))
    else:
        lines.append(json.dumps(data, indent=2))

    if resp.status_code == 404:
        lines.append(
            "HINT: the Control Server has no such route. It is started separately and does not "
            "update itself when the repo is pulled, so it is most likely still running an older "
            "version — restart it on the host (Server/start_server.sh) to load the current routes."
        )


def _finish(db: Session, log: DeploymentLogDBM, status: str, lines: list[str], confirmed_commit: str | None = None) -> None:
    """Writes a job's outcome, but only while the row is still running. A reconcile that settled it first keeps its
    outcome, so exactly one outcome lands."""
    values = {"status": status, "log_output": "\n".join(lines), "completed_at": _utcnow()}
    if confirmed_commit is not None:
        values["commit_sha"] = confirmed_commit
    if not settle_row(db, DeploymentLogDBM, log.id, ("running",), **values):
        logger.warning("deployment %s was settled before its job finished; its %s outcome was not recorded", log.id, status)


def _record_expected(db: Session, log: DeploymentLogDBM, expected: str, note: str, lines: list[str]) -> None:
    """Stores the commit the job must end up on BEFORE its request goes out. A BackOffice restart ends this process
    before it can record anything else, so a later process settles the row from this."""
    log.expected_commit = expected
    lines.append(f"expected commit: {expected} ({note})")
    db.commit()


def own_evidence() -> dict:
    """What this BackOffice process reports about itself: the commit it was started on, and when it started."""
    return {"commit": instance.COMMIT, "started_at": instance.STARTED_AT}


def shadow_evidence(payload: dict | None) -> dict | None:
    """What Shadow's /health reports, or None when there is no answer with status ok."""
    if payload is None:
        return None
    commit = payload.get("commit")
    return {
        "commit": commit.lower() if isinstance(commit, str) and commit else None,
        "started_at": parse_utc(payload.get("started_at")),
    }


def _restarted(evidence: dict, requested: datetime) -> bool:
    return evidence["started_at"] is not None and evidence["started_at"] >= requested


def _deploy_verdict(app: str, expected: str, requested: datetime, evidence: dict | None, window_passed: bool) -> tuple[str, str]:
    """(status, line) for a deploy, from what a running process reports. Only a process that started after the request
    counts. Success needs that process to run the expected commit. A restarted process on another commit fails at once.
    Without a restarted process, the deploy fails only once the time limit has passed, since the restart may still be
    in progress until then. A missing answer or a null commit stays unknown."""
    label = _LABEL[app]
    if evidence is None:
        return "unknown", f"{label} did not answer its health check with status ok, so the outcome is not confirmed yet."
    commit, started = evidence["commit"], evidence["started_at"]
    if commit is None:
        return "unknown", f"{label} did not report the commit it runs, so the outcome is not confirmed yet."
    if started is None:
        return "unknown", f"{label} did not report when it started, so the outcome is not confirmed yet."
    if _restarted(evidence, requested):
        if commit == expected:
            return "success", f"{label} started after the request and runs the expected commit {expected[:7]}."
        return "failed", f"{label} started after the request and runs commit {commit[:7]}, not the expected {expected[:7]}."
    if window_passed:
        return "failed", f"{label} has not started since the request, and the time limit has passed. The deploy did not take effect."
    return "unknown", f"{label} started before the request, so the restart it caused is not confirmed yet."


def restart_verdict(app: str, requested: datetime, evidence: dict | None, window_passed: bool = False) -> tuple[str, str]:
    """(status, line) for a plain restart. It needs no commit: a process that started after the request and answers its
    health check with status ok is the evidence. Without one, the restart fails once the time limit has passed, and until
    then it may still be in progress. A missing answer, or one with no start time, stays unknown: it is no evidence of failure."""
    label = _LABEL[app]
    if evidence is None:
        return "unknown", f"{label} did not answer its health check with status ok, so the restart is not confirmed yet."
    started = evidence["started_at"]
    if started is None:
        return "unknown", f"{label} did not report when it started, so the restart is not confirmed yet."
    if started >= requested:
        return "success", f"{label} started after the restart was requested and answers its health check."
    if window_passed:
        return "failed", f"{label} has not started since the restart was requested, and the time limit has passed."
    return "unknown", f"{label} started before the restart was requested, so the restart is not confirmed yet."


def _run_job(deployment_id: int, git_ref: str, app: str, allow_branch: bool) -> None:
    db = SessionLocal()
    log: DeploymentLogDBM | None = None
    sent = False
    lines: list[str] = []
    segment = _control_segment(app)
    try:
        log = db.get(DeploymentLogDBM, deployment_id)
        if log is None:
            return
        requested = ensure_utc(log.started_at)

        try:
            is_branch, expected = _resolve_target(git_ref, app, allow_branch)
        except TargetUnresolved as e:
            _finish(db, log, "failed", [f"{e} Nothing was changed."])
            return
        except httpx.RequestError as e:
            _finish(db, log, "failed", [f"ERROR: could not reach the Control Server ({e}). Nothing was changed."])
            return

        if is_branch:
            endpoint, body = f"/control/{segment}/deploy", {"branch": git_ref}
            lines.append(f"$ POST {settings.control_server_url}{endpoint}  (branch={git_ref})")
            _record_expected(db, log, expected, f"tip of origin/{git_ref}", lines)
        else:
            endpoint, body = f"/control/{segment}/rollback", {"commit_sha": git_ref}
            lines.append(f"$ POST {settings.control_server_url}{endpoint}  (commit_sha={git_ref})")
            if allow_branch:
                lines.append(
                    f"'{git_ref}' did not resolve to a branch on origin — checking it out directly (detached HEAD), "
                    "the same way a tag or a specific commit SHA is deployed."
                )
            _record_expected(db, log, expected, f"resolved from {git_ref}", lines)

        if app == "backoffice":
            self_restart.announce_self_restart(db, log, lines)

        try:
            sent = True
            resp = _control_post(endpoint, body, timeout=RESTART_CALL_TIMEOUT_S)
        except httpx.RequestError as e:
            if isinstance(e, NOT_SENT_ERRORS):
                lines.append(f"ERROR: could not reach the Control Server ({e}). Nothing was changed.")
                _finish(db, log, "failed", lines)
            else:
                lines.append(f"ERROR: the request was sent, but no answer came back ({e}).")
                lines.append(_OPEN_LINE)
                _finish(db, log, "unknown", lines)
            return

        _append_control_response(lines, resp)
        code = resp.status_code
        data = control_json(resp)
        if 400 <= code < 500:
            # Route, auth or validation: the Control Server refused the request before running any step.
            lines.append("The Control Server rejected the request, so nothing ran.")
            _finish(db, log, "failed", lines)
            return
        if code >= 500 or not isinstance(data, dict) or not isinstance(data.get("returncode"), int):
            lines.append("The Control Server's answer does not show whether the steps ran.")
            lines.append(_OPEN_LINE)
            _finish(db, log, "unknown", lines)
            return
        if data["returncode"] != 0:
            lines.append(f"The Control Server reported exit code {data['returncode']}, so the job did not succeed.")
            _finish(db, log, "failed", lines)
            return
        if app == "backoffice":
            # The restart ends this process, so an answer that reaches it means this process was not replaced.
            status, line = _deploy_verdict(app, expected, requested, own_evidence(), window_passed=False)
            lines.append(line)
            _finish(db, log, status, lines, confirmed_commit=expected if status == "success" else None)
            return
        if not allow_branch:
            lines.append(_ROLLBACK_NOTE)

        payload = shadow_client.wait_for_restarted(requested)
        if payload is None:
            status = "unknown"
            lines.append("Shadow did not report a process started after the request within the timeout, so the outcome is not confirmed yet.")
        else:
            status, line = _deploy_verdict(app, expected, requested, shadow_evidence(payload), window_passed=False)
            lines.append(line)
        _finish(db, log, status, lines, confirmed_commit=expected if status == "success" else None)
    except Exception as e:
        if log is not None:
            try:
                _finish(db, log, "unknown" if sent else "failed", lines + [f"ERROR: unexpected failure — {e}"])
            except Exception:
                pass
    finally:
        db.close()


def run_deploy_job(deployment_id: int, git_ref: str, app: str = "shadow") -> None:
    """Runs as a FastAPI BackgroundTask — opens its own DB session since the
    request-scoped one is already closed by the time this executes.

    `git_ref` can be a branch, a tag, or a commit SHA — resolved here (not
    by the caller) since deciding which control-server call to make needs
    a fresh fetch either way. A branch is a moving ref, so it goes through
    /control/{app}/deploy (checkout + pull); a tag or SHA is fixed, so it
    goes through /control/{app}/rollback (checkout only, detached HEAD) —
    same mechanics rollback already uses, just recorded here as kind
    "deploy" since that's what the admin actually asked for.
    """
    _run_job(deployment_id, git_ref, app, allow_branch=True)


def run_rollback_job(deployment_id: int, commit_sha: str, app: str = "shadow") -> None:
    _run_job(deployment_id, commit_sha, app, allow_branch=False)


def _write_open(log_id: int, from_status: str, new_status: str, line: str, now: datetime, commit_sha: str | None = None) -> None:
    values = {"status": new_status, "log_output": DeploymentLogDBM.log_output + f"\n{line}"}
    if from_status == "running":
        # An overdue job ends now. An unknown one ended when it was recorded, and the server's uptime counts from that.
        values["completed_at"] = now
    if commit_sha is not None:
        values["commit_sha"] = commit_sha
    with SessionLocal() as db:
        settle_row(db, DeploymentLogDBM, log_id, (from_status,), **values)


def reconcile_due(key: str, force: bool) -> bool:
    """Whether open outcomes of `key` may be reconciled now, and records that they are. Reads pass at most once per
    RECONCILE_INTERVAL_S for each key, since an open outcome stays open until a process answers; startup passes `force`."""
    mono = time.monotonic()
    if not force and mono - _last_reconcile.get(key, float("-inf")) < RECONCILE_INTERVAL_S:
        return False
    _last_reconcile[key] = mono
    return True


def control_server_answers(app: str) -> bool:
    """Whether the Control Server answers. An open outcome is settled only while it does (R5)."""
    return _current_commit_sha(app, timeout=RECONCILE_TIMEOUT_S) is not None


def reconcile_unsettled(app: str, force: bool = False) -> None:
    """Settles the deploy logs of `app` whose outcome is still open: "unknown" ones, and "running" ones past JOB_TIME_LIMIT.
    The running process decides each one (see _deploy_verdict). Reads call this, throttled (see reconcile_due) unless
    `force` is set (startup). An open log that stays open is left alone and checked again later. A Control Server that
    does not answer leaves unknown logs as they are, and marks overdue running ones unknown."""
    if not reconcile_due(f"deploy:{app}", force):
        return

    now = _utcnow()
    with SessionLocal() as db:
        open_logs = [
            (row.id, row.status, row.expected_commit, ensure_utc(row.started_at))
            for row in db.query(DeploymentLogDBM).filter(
                DeploymentLogDBM.app == app, DeploymentLogDBM.status.in_(("unknown", "running")),
            )
        ]

    control_answers: bool | None = None
    shadow: dict | None = None
    for log_id, status, expected, requested in open_logs:
        overdue = now - requested >= JOB_TIME_LIMIT
        if status == "running" and not overdue:
            continue  # still being run by a live job
        if expected is None:
            # Written before the expected commit was recorded, so there is nothing to compare against.
            if status == "running":
                _write_open(log_id, status, "unknown", "The expected commit was not recorded, so the outcome cannot be checked.", now)
            continue
        if control_answers is None:
            control_answers = control_server_answers(app)
            if control_answers and app == "shadow":
                shadow = shadow_evidence(shadow_client.check_health())
        if not control_answers:
            if status == "running":
                _write_open(log_id, status, "unknown", "The Control Server did not answer, so the outcome could not be checked.", now)
            continue
        evidence = own_evidence() if app == "backoffice" else shadow
        new_status, line = _deploy_verdict(app, expected, requested, evidence, window_passed=overdue)
        if status == "unknown" and new_status == "unknown":
            continue
        _write_open(
            log_id, status, new_status, f"Checked again: {line}", now,
            commit_sha=expected if new_status == "success" else None,
        )


def settle_interrupted_deployments() -> None:
    """Startup. A deploy or rollback still "running" was cut short when the process before this one stopped, so its outcome
    is unknown until it is checked. Then every open outcome is settled by the running process (see reconcile_unsettled)."""
    now = _utcnow()
    with SessionLocal() as db:
        running = [
            (row.id, row.app, row.log_output)
            for row in db.query(DeploymentLogDBM).filter(DeploymentLogDBM.status == "running")
        ]
    for log_id, app, log_output in running:
        if app == "backoffice" and self_restart.was_announced(log_output):
            message = "[backoffice] Interrupted by the BackOffice restart this deploy requested before its outcome was recorded."
        else:
            message = "[backoffice] Interrupted by a BackOffice restart before this finished."
        with SessionLocal() as db:
            settle_row(
                db, DeploymentLogDBM, log_id, ("running",),
                status="unknown", log_output=DeploymentLogDBM.log_output + f"\n{message}", completed_at=now,
            )
    reconcile_unsettled("shadow", force=True)
    reconcile_unsettled("backoffice", force=True)
