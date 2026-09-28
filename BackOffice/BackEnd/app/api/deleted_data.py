import json

from fastapi import APIRouter

from app.api.deps import CurrentAdmin
from app.core.endpoints import ENDPOINTS
from app.core.exceptions import ValidationError
from app.schemas.database import RowLookupResponse, RowsResponse, TableInfo
from app.services import database_service, deleted_data_service

# Read-only browsing of deleted_data.db - the "Deleted Data" tab on the
# Database page, shown regardless of which target (shadow/backoffice) tab
# it's opened from since there's only one shared archive. Reuses
# database_service's exact schema/pagination/JSON-decoding logic via a
# closure over deleted_data_service.run_sql, same technique the live
# Database page's backup browser already uses for a specific backup file.
router = APIRouter(prefix=ENDPOINTS.DELETED_DATA.PREFIX, tags=["Deleted Data"])


@router.get(ENDPOINTS.DELETED_DATA.TABLES, response_model=list[TableInfo])
def list_deleted_data_tables(_admin: CurrentAdmin):
    return database_service.list_tables(deleted_data_service.run_sql)


@router.get(ENDPOINTS.DELETED_DATA.ROWS, response_model=RowsResponse)
def get_deleted_data_rows(
    table_name: str,
    _admin: CurrentAdmin,
    page: int = 1,
    page_size: int = 20,
    search: str = "",
):
    return database_service.get_rows(table_name, page, page_size, search, deleted_data_service.run_sql)


@router.get(ENDPOINTS.DELETED_DATA.ROW, response_model=RowLookupResponse)
def get_deleted_data_row(table_name: str, pk: str, _admin: CurrentAdmin):
    try:
        pk_dict = json.loads(pk)
    except (json.JSONDecodeError, TypeError):
        raise ValidationError("Invalid pk parameter - must be JSON.")
    return {"row": database_service.get_row(table_name, pk_dict, deleted_data_service.run_sql)}
