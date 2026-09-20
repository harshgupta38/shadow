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


class SqlQueryResponse(BaseModel):
    columns: list[str]
    rows: list[dict[str, Any]]
    rowcount: int


class InsertRowRequest(BaseModel):
    data: dict[str, Any]


class UpdateRowRequest(BaseModel):
    pk: dict[str, Any]
    data: dict[str, Any]


class DeleteRowRequest(BaseModel):
    pk: dict[str, Any]
