from datetime import datetime
from typing import Any

from pydantic import BaseModel

from app.core.timezone import UtcDateTime


class ColumnInfo(BaseModel):
    name: str
    type: str
    nullable: bool
    pk: bool
    fk: str | None = None
    # Only set for JSON columns where BackEnd_V2's own model annotation
    # declares a specific shape (see model_constraints.py) — lets the
    # frontend offer a structured editor instead of a raw-text box.
    json_shape: str | None = None
    # The fixed set of values a CheckConstraint("col IN (...)") allows for
    # this column, in declaration order — lets the row editor offer a
    # dropdown instead of free text (e.g. `priority`, `agent_type`).
    allowed_values: list[str] | None = None


class TableInfo(BaseModel):
    name: str
    row_count: int
    columns: list[ColumnInfo]


class RowsResponse(BaseModel):
    columns: list[ColumnInfo]
    rows: list[dict[str, Any]]
    total: int
    page: int
    page_size: int


class RowLookupResponse(BaseModel):
    row: dict[str, Any] | None


class SqlQueryRequest(BaseModel):
    query: str
    page: int = 1
    page_size: int = 15
    # False when the console is only turning to another page of a result it already ran — that is
    # not a new query, so it must not add to the saved history.
    record_history: bool = True


class SqlQueryResponse(BaseModel):
    columns: list[str]
    rows: list[dict[str, Any]]
    rowcount: int
    # None for a statement that doesn't return a row set (INSERT/UPDATE/
    # DELETE/DDL/...) — there's nothing to page through, so the frontend
    # shows rowcount as-is with no pager. Set whenever the query could be
    # wrapped as a subquery (any SELECT-shaped statement), even if every row
    # already fit in this one response.
    total: int | None = None
    page: int = 1
    page_size: int = 15


class SqlSplitRequest(BaseModel):
    query: str


class SqlSplitResponse(BaseModel):
    # The statements of a pasted script, in order, each ready to run on its own.
    statements: list[str]


class SqlHistoryEntry(BaseModel):
    id: int
    query: str
    success: bool
    # The first page of what the query returned when it ran; None for a failed query.
    result: SqlQueryResponse | None
    error_message: str | None
    # True when the saved output had rows dropped to stay under the size cap.
    truncated: bool
    duration_ms: int | None
    executed_at: UtcDateTime


class InsertRowRequest(BaseModel):
    data: dict[str, Any]


class UpdateRowRequest(BaseModel):
    pk: dict[str, Any]
    data: dict[str, Any]


class DeleteRowRequest(BaseModel):
    pk: dict[str, Any]


class BackupInfo(BaseModel):
    name: str
    created_at: datetime
    size_bytes: int


class RestoreBackupResponse(BaseModel):
    restored_from: str
    pre_restore_backup: BackupInfo


class DeleteBackupResponse(BaseModel):
    deleted: str
