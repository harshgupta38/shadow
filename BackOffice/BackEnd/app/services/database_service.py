"""Table browsing/editing built on top of shadow_client.run_sql().

BackEnd_V2's /admin/sql (see app/api/system.py) takes a single free-text
`query` string with no parameter binding, so every statement built here is
composed as text. That means two rules are non-negotiable everywhere below:

  1. Table and column NAMES are only ever taken from a freshly-fetched real
     schema (list_table_names / get_table_columns) — never interpolated
     straight from a request. `_validate_table` and the pk/column checks in
     insert/update/delete are what enforce this; skipping them would open a
     SQL-injection hole through an identifier instead of a value.
  2. Every VALUE goes through `_quote_literal`, which escapes single quotes
     and renders the value as a proper SQL literal. Never use an f-string to
     splice a raw value into a query.
"""

import json
from typing import Any

from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError, ValidationError
from app.models.sql_audit_log import SqlAuditLogDBM
from app.services import model_constraints, shadow_client


def _quote_ident(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def _quote_literal(value: Any) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float)):
        return repr(value)
    if isinstance(value, (dict, list)):
        value = json.dumps(value)
    escaped = str(value).replace("'", "''")
    return f"'{escaped}'"


def _audit(db: Session, admin_username: str, query: str, success: bool, row_count: int | None, error: str | None) -> None:
    db.add(SqlAuditLogDBM(
        admin_username=admin_username,
        query=query,
        success=success,
        row_count=row_count,
        error_message=error,
    ))
    db.commit()


def list_table_names() -> list[str]:
    result = shadow_client.run_sql(
        "SELECT name FROM sqlite_master WHERE type='table' "
        "AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' ORDER BY name"
    )
    return [row["name"] for row in result["rows"]]


def get_table_columns(table_name: str) -> list[dict]:
    result = shadow_client.run_sql(f"PRAGMA table_info({_quote_ident(table_name)})")
    fk_result = shadow_client.run_sql(f"PRAGMA foreign_key_list({_quote_ident(table_name)})")
    fk_by_column = {row["from"]: f"{row['table']}.{row['to']}" for row in fk_result["rows"]}

    columns = []
    for row in result["rows"]:
        columns.append({
            "name": row["name"],
            "type": (row["type"] or "TEXT").upper(),
            "nullable": row["notnull"] == 0,
            "pk": row["pk"] > 0,
            "fk": fk_by_column.get(row["name"]),
            "json_shape": model_constraints.get_json_shape(table_name, row["name"]),
        })
    return columns


def _validate_table(table_name: str) -> None:
    if table_name not in list_table_names():
        raise NotFoundError(f"Table '{table_name}' does not exist.")


def list_tables() -> list[dict]:
    tables = []
    for name in list_table_names():
        columns = get_table_columns(name)
        count_result = shadow_client.run_sql(f"SELECT COUNT(*) AS c FROM {_quote_ident(name)}")
        row_count = count_result["rows"][0]["c"] if count_result["rows"] else 0
        tables.append({"name": name, "row_count": row_count, "columns": columns})
    return tables


def get_rows(table_name: str, page: int, page_size: int, search: str) -> dict:
    _validate_table(table_name)
    columns = get_table_columns(table_name)
    column_names = [c["name"] for c in columns]

    where_clause = ""
    if search.strip():
        term = search.replace("'", "''").replace("%", "\\%").replace("_", "\\_")
        conditions = [
            f"CAST({_quote_ident(c)} AS TEXT) LIKE '%{term}%' ESCAPE '\\'"
            for c in column_names
        ]
        where_clause = " WHERE " + " OR ".join(conditions)

    count_sql = f"SELECT COUNT(*) AS c FROM {_quote_ident(table_name)}{where_clause}"
    count_result = shadow_client.run_sql(count_sql)
    total = count_result["rows"][0]["c"] if count_result["rows"] else 0

    page = max(page, 1)
    page_size = max(min(page_size, 200), 1)
    offset = (page - 1) * page_size
    rows_sql = (
        f"SELECT * FROM {_quote_ident(table_name)}{where_clause} "
        f"LIMIT {page_size} OFFSET {offset}"
    )
    rows_result = shadow_client.run_sql(rows_sql)

    return {
        "columns": columns,
        "rows": _decode_json_columns(rows_result["rows"], columns),
        "total": total,
        "page": page,
        "page_size": page_size,
    }


def _pk_columns(columns: list[dict]) -> set[str]:
    return {c["name"] for c in columns if c["pk"]}


def _decode_json_columns(rows: list[dict], columns: list[dict]) -> list[dict]:
    """shadow_client.run_sql() (and SQLite itself) hands JSON columns back
    as the raw TEXT they're stored as — never parsed. Left alone, that text
    gets JSON-encoded a second time on the way out of this API (a string
    wrapped in another layer of quotes/escapes), which is exactly the
    mangled double-encoded text the row editor was showing. Decode each
    JSON-typed column's value once here, so the API response — and the
    list-shape editor, which needs a real array to render — get the actual
    structure instead of its stringified form."""
    json_cols = [c["name"] for c in columns if c["type"] == "JSON"]
    if not json_cols:
        return rows
    for row in rows:
        for col in json_cols:
            value = row.get(col)
            if isinstance(value, str):
                try:
                    row[col] = json.loads(value)
                except ValueError:
                    pass  # not valid JSON (legacy/corrupt data) — leave the raw text as-is
    return rows


def get_row(table_name: str, pk: dict) -> dict | None:
    """Re-fetches a single row by primary key — the row editor's "refresh"
    action, for when the underlying data may have changed since it loaded.
    """
    _validate_table(table_name)
    columns = get_table_columns(table_name)
    pk_columns = _pk_columns(columns)

    if not pk_columns:
        raise ValidationError(f"Table '{table_name}' has no primary key — cannot look up a single row.")
    if set(pk.keys()) != pk_columns:
        raise ValidationError(f"Primary key value(s) required: {', '.join(sorted(pk_columns))}")

    where_sql = " AND ".join(f"{_quote_ident(c)} = {_quote_literal(v)}" for c, v in pk.items())
    query = f"SELECT * FROM {_quote_ident(table_name)} WHERE {where_sql} LIMIT 1"
    result = shadow_client.run_sql(query)
    if not result["rows"]:
        return None
    return _decode_json_columns(result["rows"], columns)[0]


def insert_row(db: Session, table_name: str, data: dict, admin_username: str) -> dict:
    _validate_table(table_name)
    columns = get_table_columns(table_name)
    known = {c["name"] for c in columns}
    unknown = set(data.keys()) - known
    if unknown:
        raise ValidationError(f"Unknown column(s): {', '.join(sorted(unknown))}")
    if not data:
        raise ValidationError("Provide at least one column to insert.")

    schema_errors = model_constraints.validate_row(table_name, data)
    if schema_errors:
        raise ValidationError("Please correct the highlighted fields.", errors=schema_errors)

    col_names = list(data.keys())
    col_sql = ", ".join(_quote_ident(c) for c in col_names)
    val_sql = ", ".join(_quote_literal(data[c]) for c in col_names)
    query = f"INSERT INTO {_quote_ident(table_name)} ({col_sql}) VALUES ({val_sql})"

    try:
        result = shadow_client.run_sql(query)
    except Exception as e:
        _audit(db, admin_username, query, False, None, str(e))
        raise
    _audit(db, admin_username, query, True, result.get("rowcount"), None)
    return result


def update_row(db: Session, table_name: str, pk: dict, data: dict, admin_username: str) -> dict:
    _validate_table(table_name)
    columns = get_table_columns(table_name)
    known = {c["name"] for c in columns}
    pk_columns = _pk_columns(columns)

    if not pk_columns:
        raise ValidationError(f"Table '{table_name}' has no primary key — cannot target a single row.")
    if set(pk.keys()) != pk_columns:
        raise ValidationError(f"Primary key value(s) required: {', '.join(sorted(pk_columns))}")
    unknown = set(data.keys()) - known
    if unknown:
        raise ValidationError(f"Unknown column(s): {', '.join(sorted(unknown))}")
    if not data:
        raise ValidationError("No fields to update.")

    schema_errors = model_constraints.validate_row(table_name, data)
    if schema_errors:
        raise ValidationError("Please correct the highlighted fields.", errors=schema_errors)

    set_sql = ", ".join(f"{_quote_ident(c)} = {_quote_literal(v)}" for c, v in data.items())
    where_sql = " AND ".join(f"{_quote_ident(c)} = {_quote_literal(v)}" for c, v in pk.items())
    query = f"UPDATE {_quote_ident(table_name)} SET {set_sql} WHERE {where_sql}"

    try:
        result = shadow_client.run_sql(query)
    except Exception as e:
        _audit(db, admin_username, query, False, None, str(e))
        raise
    _audit(db, admin_username, query, True, result.get("rowcount"), None)
    return result


def delete_row(db: Session, table_name: str, pk: dict, admin_username: str) -> dict:
    _validate_table(table_name)
    columns = get_table_columns(table_name)
    pk_columns = _pk_columns(columns)

    if not pk_columns:
        raise ValidationError(f"Table '{table_name}' has no primary key — cannot target a single row.")
    if set(pk.keys()) != pk_columns:
        raise ValidationError(f"Primary key value(s) required: {', '.join(sorted(pk_columns))}")

    where_sql = " AND ".join(f"{_quote_ident(c)} = {_quote_literal(v)}" for c, v in pk.items())
    query = f"DELETE FROM {_quote_ident(table_name)} WHERE {where_sql}"

    try:
        result = shadow_client.run_sql(query)
    except Exception as e:
        _audit(db, admin_username, query, False, None, str(e))
        raise
    _audit(db, admin_username, query, True, result.get("rowcount"), None)
    return result


def run_raw_query(db: Session, query: str, admin_username: str) -> dict:
    """SQL Console — deliberately unrestricted, matching the power
    /admin/sql already has. Every attempt is audited regardless of outcome.
    """
    try:
        result = shadow_client.run_sql(query)
    except Exception as e:
        _audit(db, admin_username, query, False, None, str(e))
        raise
    _audit(db, admin_username, query, True, result.get("rowcount"), None)
    return result
