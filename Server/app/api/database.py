"""SQLite access for both managed databases.

Download takes a consistent snapshot via SQLite's online backup API (same
technique as BackEnd_V2's /admin/database) so we never stream a torn file.
"""

import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

from app.api.deps import RequireControlSecret
from app.core.config import settings
from app.core.endpoints import ENDPOINTS
from app.schemas.database import SqlRequest

router = APIRouter(prefix=ENDPOINTS.DATABASE.PREFIX, tags=["Database"])


def _snapshot(src: Path) -> Path:
    backup_dir = src.parent / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    dest = backup_dir / f"{src.stem}-control-{ts}.db"
    src_conn = sqlite3.connect(str(src))
    try:
        dst_conn = sqlite3.connect(str(dest))
        try:
            src_conn.backup(dst_conn)
        finally:
            dst_conn.close()
    finally:
        src_conn.close()
    return dest


def _run_sql(db_path: Path, query: str) -> dict:
    if not db_path.exists():
        raise HTTPException(status_code=404, detail=f"{db_path.name} not found.")
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    try:
        cur.execute(query)
        conn.commit()
        columns = [d[0] for d in cur.description] if cur.description else []
        rows = cur.fetchall()
        return {"rowcount": cur.rowcount, "columns": columns, "rows": [dict(r) for r in rows]}
    except Exception as exc:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(exc))
    finally:
        conn.close()


# ─── Shadow V2 ───────────────────────────────────────────────────────────────

@router.get(ENDPOINTS.DATABASE.MAIN_DOWNLOAD)
def download_main_db(_auth: RequireControlSecret):
    src = settings.main_path / "shadow.db"
    if not src.exists():
        raise HTTPException(status_code=404, detail="shadow.db not found.")
    dest = _snapshot(src)
    return FileResponse(
        path=dest, media_type="application/x-sqlite3", filename="shadow.db",
        background=BackgroundTask(dest.unlink, missing_ok=True),
    )


@router.post(ENDPOINTS.DATABASE.MAIN_QUERY)
def query_main_db(_auth: RequireControlSecret, body: SqlRequest) -> dict:
    return _run_sql(settings.main_path / "shadow.db", body.query)


# ─── BackOffice ──────────────────────────────────────────────────────────────

@router.get(ENDPOINTS.DATABASE.BACKOFFICE_DOWNLOAD)
def download_backoffice_db(_auth: RequireControlSecret):
    src = settings.backoffice_path / "backoffice.db"
    if not src.exists():
        raise HTTPException(status_code=404, detail="backoffice.db not found.")
    dest = _snapshot(src)
    return FileResponse(
        path=dest, media_type="application/x-sqlite3", filename="backoffice.db",
        background=BackgroundTask(dest.unlink, missing_ok=True),
    )


@router.post(ENDPOINTS.DATABASE.BACKOFFICE_QUERY)
def query_backoffice_db(_auth: RequireControlSecret, body: SqlRequest) -> dict:
    return _run_sql(settings.backoffice_path / "backoffice.db", body.query)
