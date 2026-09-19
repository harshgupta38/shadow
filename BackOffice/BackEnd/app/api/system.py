"""BackOffice's own public system endpoints — mirrors BackEnd_V2's
app/api/system.py (health, server log, admin database/sql), plus a
restart-webhook endpoint since BackOffice has no separate exposed webhook
listener process the way BackEnd_V2 does (its own webhook_listener.py runs
on port 9001, which isn't publicly reachable).
"""

import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import FileResponse, PlainTextResponse
from pydantic import BaseModel
from starlette.background import BackgroundTask

from app.core.config import settings
from app.core.endpoints import ENDPOINTS

router = APIRouter()


class SqlRequest(BaseModel):
    query: str


class RestartRequest(BaseModel):
    ref: str


@router.get(ENDPOINTS.SYSTEM.ROOT, tags=["health"])
def root() -> dict:
    return {"name": settings.app_name, "version": settings.app_version, "status": "ok"}


@router.get(ENDPOINTS.SYSTEM.HEALTH, tags=["health"])
def health() -> dict:
    return {"status": "ok"}


@router.get(ENDPOINTS.SYSTEM.SERVER_LOG, tags=["admin"], response_class=PlainTextResponse)
def get_server_log():
    log_file = Path("backoffice.log")
    if not log_file.exists():
        raise HTTPException(status_code=404, detail="backoffice.log not found.")
    return log_file.read_text(encoding="utf-8")


@router.get(ENDPOINTS.SYSTEM.ADMIN_DATABASE, tags=["admin"])
def download_database(x_admin_secret: str = Header(...)):
    if x_admin_secret != settings.admin_secret:
        raise HTTPException(status_code=403, detail="Forbidden.")

    src = Path("backoffice.db")
    if not src.exists():
        raise HTTPException(status_code=404, detail="Database file not found.")

    # Snapshot via SQLite's online backup API instead of streaming the live
    # file directly — same reasoning as BackEnd_V2's /admin/database.
    backup_dir = Path("backups")
    backup_dir.mkdir(parents=True, exist_ok=True)
    now = datetime.now(timezone.utc)
    dest = backup_dir / f"backoffice-{now.strftime('%Y%m%d-%H%M%S')}.db"

    src_conn = sqlite3.connect(str(src))
    try:
        dst_conn = sqlite3.connect(str(dest))
        try:
            src_conn.backup(dst_conn)
        finally:
            dst_conn.close()
    finally:
        src_conn.close()

    return FileResponse(
        path=dest,
        media_type="application/x-sqlite3",
        filename="backoffice.db",
        background=BackgroundTask(dest.unlink, missing_ok=True),
    )


@router.post(ENDPOINTS.SYSTEM.ADMIN_SQL, tags=["admin"])
def run_sql(body: SqlRequest, x_admin_secret: str = Header(...)):
    if x_admin_secret != settings.admin_secret:
        raise HTTPException(status_code=403, detail="Forbidden.")

    conn = sqlite3.connect("backoffice.db")
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    try:
        cur.execute(body.query)
        conn.commit()
        rows = cur.fetchall()
        columns = [d[0] for d in cur.description] if cur.description else []
        return {
            "rowcount": cur.rowcount,
            "columns": columns,
            "rows": [dict(r) for r in rows],
        }
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()


@router.post(ENDPOINTS.SYSTEM.RESTART, tags=["admin"])
def restart(body: RestartRequest):
    if body.ref != settings.backoffice_git_ref:
        return {"message": f"Ignored: not {settings.backoffice_git_branch} branch"}

    os.system(
        f"git fetch origin && git checkout {settings.backoffice_git_branch} "
        f"&& git pull origin {settings.backoffice_git_branch} && ./restart_backoffice.sh &"
    )
    return {"message": "Success"}
