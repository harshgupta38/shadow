import json
import time

from fastapi import APIRouter, Response
from fastapi.responses import FileResponse

from app.api.deps import CurrentAdmin, DbSession
from app.core.endpoints import ENDPOINTS
from app.core.exceptions import NotFoundError, ValidationError
from app.schemas.database import (
    BackupInfo,
    DeleteBackupResponse,
    DeleteRowRequest,
    InsertRowRequest,
    RestoreBackupResponse,
    RowLookupResponse,
    RowsResponse,
    SqlHistoryEntry,
    SqlQueryRequest,
    SqlQueryResponse,
    TableInfo,
    UpdateRowRequest,
)
from app.services import backoffice_db_service, database_service, shadow_db_service, sql_history_service

router = APIRouter(prefix=ENDPOINTS.DATABASE.PREFIX, tags=["Database"])

_DB_SERVICES = {"shadow": shadow_db_service, "backoffice": backoffice_db_service}


def _db_service_for(app: str):
    service = _DB_SERVICES.get(app)
    if service is None:
        raise NotFoundError(f"Unknown app '{app}' — expected 'shadow' or 'backoffice'.")
    return service


@router.get(ENDPOINTS.DATABASE.TABLES, response_model=list[TableInfo])
def list_tables(app: str, _admin: CurrentAdmin):
    return database_service.list_tables(_db_service_for(app).run_sql)


@router.get(ENDPOINTS.DATABASE.ROWS, response_model=RowsResponse)
def get_rows(
    app: str,
    table_name: str,
    _admin: CurrentAdmin,
    page: int = 1,
    page_size: int = 20,
    search: str = "",
):
    return database_service.get_rows(table_name, page, page_size, search, _db_service_for(app).run_sql)


@router.get(ENDPOINTS.DATABASE.ROW, response_model=RowLookupResponse)
def get_row(app: str, table_name: str, pk: str, _admin: CurrentAdmin):
    try:
        pk_dict = json.loads(pk)
    except (json.JSONDecodeError, TypeError):
        raise ValidationError("Invalid pk parameter — must be JSON.")
    return {"row": database_service.get_row(table_name, pk_dict, _db_service_for(app).run_sql)}


@router.get(ENDPOINTS.DATABASE.BLOB)
def get_blob(app: str, table_name: str, column: str, pk: str, _admin: CurrentAdmin):
    try:
        pk_dict = json.loads(pk)
    except (json.JSONDecodeError, TypeError):
        raise ValidationError("Invalid pk parameter — must be JSON.")
    content, content_type = database_service.get_blob(table_name, column, pk_dict, _db_service_for(app))
    return Response(content=content, media_type=content_type)


@router.post(ENDPOINTS.DATABASE.ROWS)
def create_row(app: str, table_name: str, body: InsertRowRequest, db: DbSession, admin: CurrentAdmin):
    return database_service.insert_row(db, table_name, body.data, admin.email, _db_service_for(app))


@router.put(ENDPOINTS.DATABASE.ROWS)
def update_row(app: str, table_name: str, body: UpdateRowRequest, db: DbSession, admin: CurrentAdmin):
    return database_service.update_row(db, table_name, body.pk, body.data, admin.email, _db_service_for(app))


@router.delete(ENDPOINTS.DATABASE.ROWS)
def delete_row(app: str, table_name: str, body: DeleteRowRequest, db: DbSession, admin: CurrentAdmin):
    return database_service.delete_row(db, table_name, body.pk, admin.email, _db_service_for(app))


@router.post(ENDPOINTS.DATABASE.QUERY, response_model=SqlQueryResponse)
def run_query(app: str, body: SqlQueryRequest, db: DbSession, admin: CurrentAdmin):
    db_service = _db_service_for(app)
    # Only a query's first page is a "run"; later pages are the console turning pages of that result.
    record = body.record_history and body.page == 1
    started = time.perf_counter()
    try:
        result = database_service.run_raw_query(
            db, body.query, admin.email, body.page, body.page_size, db_service,
        )
    except Exception as exc:
        if record:
            sql_history_service.record(
                db, admin.email, app, body.query,
                error=getattr(exc, "detail", None) or str(exc),
                duration_ms=round((time.perf_counter() - started) * 1000),
            )
        raise
    if record:
        sql_history_service.record(
            db, admin.email, app, body.query,
            result=result, duration_ms=round((time.perf_counter() - started) * 1000),
        )
    return result


@router.get(ENDPOINTS.DATABASE.SQL_HISTORY, response_model=list[SqlHistoryEntry])
def get_sql_history(app: str, db: DbSession, admin: CurrentAdmin):
    _db_service_for(app)
    return sql_history_service.list_history(db, admin.email, app)


@router.delete(ENDPOINTS.DATABASE.SQL_HISTORY, status_code=204)
def clear_sql_history(app: str, db: DbSession, admin: CurrentAdmin):
    _db_service_for(app)
    sql_history_service.clear_history(db, admin.email, app)


@router.get(ENDPOINTS.DATABASE.BACKUPS, response_model=list[BackupInfo])
def list_backups(app: str, _admin: CurrentAdmin):
    return _db_service_for(app).list_backups()


@router.post(ENDPOINTS.DATABASE.BACKUPS, response_model=BackupInfo)
def create_backup(app: str, _admin: CurrentAdmin):
    return _db_service_for(app).create_backup()


@router.get(ENDPOINTS.DATABASE.BACKUP_FILE)
def download_backup(app: str, filename: str, _admin: CurrentAdmin):
    path = _db_service_for(app).download_backup(filename)
    return FileResponse(
        path=path,
        media_type="application/x-sqlite3",
        filename=filename,
    )


@router.post(ENDPOINTS.DATABASE.BACKUP_RESTORE, response_model=RestoreBackupResponse)
def restore_backup(app: str, filename: str, db: DbSession, admin: CurrentAdmin):
    return database_service.restore_backup(db, filename, admin.email, _db_service_for(app))


@router.delete(ENDPOINTS.DATABASE.BACKUP_FILE, response_model=DeleteBackupResponse)
def delete_backup(app: str, filename: str, db: DbSession, admin: CurrentAdmin):
    return database_service.delete_backup(db, filename, admin.email, _db_service_for(app))


@router.get(ENDPOINTS.DATABASE.BACKUP_TABLES, response_model=list[TableInfo])
def list_backup_tables(app: str, filename: str, _admin: CurrentAdmin):
    return database_service.list_backup_tables(filename, _db_service_for(app))


@router.get(ENDPOINTS.DATABASE.BACKUP_ROWS, response_model=RowsResponse)
def get_backup_rows(
    app: str,
    filename: str,
    table_name: str,
    _admin: CurrentAdmin,
    page: int = 1,
    page_size: int = 20,
    search: str = "",
):
    return database_service.get_backup_rows(filename, table_name, page, page_size, search, _db_service_for(app))


@router.get(ENDPOINTS.DATABASE.BACKUP_ROW, response_model=RowLookupResponse)
def get_backup_row(app: str, filename: str, table_name: str, pk: str, _admin: CurrentAdmin):
    try:
        pk_dict = json.loads(pk)
    except (json.JSONDecodeError, TypeError):
        raise ValidationError("Invalid pk parameter — must be JSON.")
    return {"row": database_service.get_backup_row(filename, table_name, pk_dict, _db_service_for(app))}

