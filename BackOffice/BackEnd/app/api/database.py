from fastapi import APIRouter

from app.api.deps import CurrentAdmin, DbSession
from app.core.endpoints import ENDPOINTS
from app.schemas.database import (
    DeleteRowRequest,
    InsertRowRequest,
    RowsResponse,
    SqlQueryRequest,
    SqlQueryResponse,
    TableInfo,
    UpdateRowRequest,
)
from app.services import database_service

router = APIRouter(prefix=ENDPOINTS.DATABASE.PREFIX, tags=["Database"])


@router.get(ENDPOINTS.DATABASE.TABLES, response_model=list[TableInfo])
def list_tables(_admin: CurrentAdmin):
    return database_service.list_tables()


@router.get(ENDPOINTS.DATABASE.ROWS, response_model=RowsResponse)
def get_rows(
    table_name: str,
    _admin: CurrentAdmin,
    page: int = 1,
    page_size: int = 20,
    search: str = "",
):
    return database_service.get_rows(table_name, page, page_size, search)


@router.post(ENDPOINTS.DATABASE.ROWS)
def create_row(table_name: str, body: InsertRowRequest, db: DbSession, admin: CurrentAdmin):
    return database_service.insert_row(db, table_name, body.data, admin.username)


@router.put(ENDPOINTS.DATABASE.ROWS)
def update_row(table_name: str, body: UpdateRowRequest, db: DbSession, admin: CurrentAdmin):
    return database_service.update_row(db, table_name, body.pk, body.data, admin.username)


@router.delete(ENDPOINTS.DATABASE.ROWS)
def delete_row(table_name: str, body: DeleteRowRequest, db: DbSession, admin: CurrentAdmin):
    return database_service.delete_row(db, table_name, body.pk, admin.username)


@router.post(ENDPOINTS.DATABASE.QUERY, response_model=SqlQueryResponse)
def run_query(body: SqlQueryRequest, db: DbSession, admin: CurrentAdmin):
    return database_service.run_raw_query(db, body.query, admin.username)
