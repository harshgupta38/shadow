from typing import Any

from pydantic import BaseModel


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


class InsertRowRequest(BaseModel):
    data: dict[str, Any]


class UpdateRowRequest(BaseModel):
    pk: dict[str, Any]
    data: dict[str, Any]


class DeleteRowRequest(BaseModel):
    pk: dict[str, Any]
