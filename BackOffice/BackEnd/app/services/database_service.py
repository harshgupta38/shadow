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
import logging
from typing import Any, Callable

from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError, ValidationError
from app.models.sql_audit_log import SqlAuditLogDBM
from app.services import model_constraints, shadow_client

logger = logging.getLogger(__name__)

# Every read function below takes an optional `run_sql` — the function that
# actually executes a query string and returns {"rowcount", "columns",
# "rows"}. Defaulting to shadow_client.run_sql (the live database) means
# every existing call site keeps working unchanged; passing a closure over
# shadow_client.run_backup_sql(filename, ...) instead makes the exact same
# schema-introspection/search/pagination/JSON-decoding logic browse a
# specific backup file, read-only, with no duplicated code. Never used for
# the write path (insert/update/delete/run_raw_query) — those only ever
# make sense against the live database.
RunSql = Callable[[str], dict]


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


def list_table_names(run_sql: RunSql | None = None) -> list[str]:
    run_sql = run_sql or shadow_client.run_sql
    result = run_sql(
        "SELECT name FROM sqlite_master WHERE type='table' "
        "AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' ORDER BY name"
    )
    return [row["name"] for row in result["rows"]]


def get_table_columns(table_name: str, run_sql: RunSql | None = None) -> list[dict]:
    run_sql = run_sql or shadow_client.run_sql
    result = run_sql(f"PRAGMA table_info({_quote_ident(table_name)})")
    fk_result = run_sql(f"PRAGMA foreign_key_list({_quote_ident(table_name)})")
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


def _validate_table(table_name: str, run_sql: RunSql | None = None) -> None:
    if table_name not in list_table_names(run_sql):
        raise NotFoundError(f"Table '{table_name}' does not exist.")


def list_tables(run_sql: RunSql | None = None) -> list[dict]:
    """Every table's name, columns, and row count in a fixed number of
    queries regardless of how many tables exist — get_table_columns() is
    fine for the single-table callers below, but calling it once per table
    here made every listing cost 1 + 3*N queries. For the backup browser
    each one is a full HTTP round-trip to BackEnd_V2 that opens a fresh
    read-only connection, so at 20 tables that's ~60 requests just to open
    a backup. This makes 3, using SQLite's pragma table-valued functions
    (pragma_table_info / pragma_foreign_key_list) joined against
    sqlite_master to fetch every table's schema at once, plus one UNION ALL
    for every table's row count.
    """
    run_sql = run_sql or shadow_client.run_sql
    names = list_table_names(run_sql)
    if not names:
        return []

    columns_by_table = _all_table_columns(names, run_sql)
    counts_by_table = _all_table_row_counts(names, run_sql)

    return [
        {"name": name, "row_count": counts_by_table.get(name, 0), "columns": columns_by_table.get(name, [])}
        for name in names
    ]


def _all_table_columns(names: list[str], run_sql: RunSql) -> dict[str, list[dict]]:
    columns_result = run_sql(
        "SELECT m.name AS __bo_table, p.* FROM sqlite_master m "
        "JOIN pragma_table_info(m.name) p "
        "WHERE m.type='table' AND m.name NOT LIKE 'sqlite\\_%' ESCAPE '\\'"
    )
    fk_result = run_sql(
        "SELECT m.name AS __bo_table, fk.* FROM sqlite_master m "
        "JOIN pragma_foreign_key_list(m.name) fk "
        "WHERE m.type='table' AND m.name NOT LIKE 'sqlite\\_%' ESCAPE '\\'"
    )

    fk_by_table: dict[str, dict[str, str]] = {}
    for row in fk_result["rows"]:
        fk_by_table.setdefault(row["__bo_table"], {})[row["from"]] = f"{row['table']}.{row['to']}"

    columns_by_table: dict[str, list[dict]] = {name: [] for name in names}
    for row in columns_result["rows"]:
        table_name = row["__bo_table"]
        if table_name not in columns_by_table:
            continue
        columns_by_table[table_name].append({
            "name": row["name"],
            "type": (row["type"] or "TEXT").upper(),
            "nullable": row["notnull"] == 0,
            "pk": row["pk"] > 0,
            "fk": fk_by_table.get(table_name, {}).get(row["name"]),
            "json_shape": model_constraints.get_json_shape(table_name, row["name"]),
        })
    return columns_by_table


def _all_table_row_counts(names: list[str], run_sql: RunSql) -> dict[str, int]:
    query = " UNION ALL ".join(
        f"SELECT {_quote_literal(name)} AS __bo_table, COUNT(*) AS c FROM {_quote_ident(name)}"
        for name in names
    )
    result = run_sql(query)
    return {row["__bo_table"]: row["c"] for row in result["rows"]}


def get_rows(table_name: str, page: int, page_size: int, search: str, run_sql: RunSql | None = None) -> dict:
    run_sql = run_sql or shadow_client.run_sql
    _validate_table(table_name, run_sql)
    columns = get_table_columns(table_name, run_sql)
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
    count_result = run_sql(count_sql)
    total = count_result["rows"][0]["c"] if count_result["rows"] else 0

    page = max(page, 1)
    page_size = max(min(page_size, 200), 1)
    offset = (page - 1) * page_size
    rows_sql = (
        f"SELECT * FROM {_quote_ident(table_name)}{where_clause} "
        f"LIMIT {page_size} OFFSET {offset}"
    )
    rows_result = run_sql(rows_sql)

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
    structure instead of its stringified form.

    A column counts as JSON-holding if either the live SQLite schema says so
    (`type == "JSON"`) OR model_constraints' AST-derived json_shape says so —
    the two can disagree when a column's declared SQL type has drifted from
    its model (e.g. an old migration left it as TEXT while the model has
    since moved to `Mapped[dict]`/JSON), and json_shape, read fresh from the
    model source, is the one that reflects what the data actually is."""
    json_cols = [c["name"] for c in columns if c["type"] == "JSON" or c.get("json_shape") is not None]
    if not json_cols:
        return rows
    for row in rows:
        for col in json_cols:
            value = row.get(col)
            if not isinstance(value, str):
                continue
            # A handful of rows were written by an older, buggy version of this
            # editor that serialized an already-serialized value, so one pass
            # can still leave a string (a JSON document whose top-level value
            # is itself a JSON-encoded string). Unwrap up to a few layers —
            # bounded so a value that's legitimately just a string forever
            # (not valid JSON at all) can't spin — and never lose data: if a
            # pass fails to parse, keep whatever the last successful pass
            # produced instead of the raw text.
            decoded = value
            for _ in range(3):
                if not isinstance(decoded, str):
                    break
                try:
                    decoded = json.loads(decoded)
                except ValueError:
                    break
            if isinstance(decoded, str):
                logger.warning(
                    "database_service: column %r still isn't valid JSON after decoding — "
                    "leaving it as raw text (row may have corrupt/legacy data).", col,
                )
            row[col] = decoded
    return rows


def get_row(table_name: str, pk: dict, run_sql: RunSql | None = None) -> dict | None:
    """Re-fetches a single row by primary key — the row editor's "refresh"
    action, for when the underlying data may have changed since it loaded.
    """
    run_sql = run_sql or shadow_client.run_sql
    _validate_table(table_name, run_sql)
    columns = get_table_columns(table_name, run_sql)
    pk_columns = _pk_columns(columns)

    if not pk_columns:
        raise ValidationError(f"Table '{table_name}' has no primary key — cannot look up a single row.")
    if set(pk.keys()) != pk_columns:
        raise ValidationError(f"Primary key value(s) required: {', '.join(sorted(pk_columns))}")

    where_sql = " AND ".join(f"{_quote_ident(c)} = {_quote_literal(v)}" for c, v in pk.items())
    query = f"SELECT * FROM {_quote_ident(table_name)} WHERE {where_sql} LIMIT 1"
    result = run_sql(query)
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


def run_raw_query(db: Session, query: str, admin_username: str, page: int = 1, page_size: int = 15) -> dict:
    """SQL Console — deliberately unrestricted, matching the power
    /admin/sql already has. Every real attempt is audited regardless of
    outcome (the pagination probe below is not — see _try_paginate).
    """
    page = max(page, 1)
    page_size = max(min(page_size, 200), 1)

    paginated = _try_paginate(query, page, page_size)
    if paginated is not None:
        rows_query, total = paginated
        try:
            result = shadow_client.run_sql(rows_query)
        except Exception as e:
            _audit(db, admin_username, query, False, None, str(e))
            raise
        _audit(db, admin_username, query, True, total, None)
        result["total"] = total
        result["page"] = page
        result["page_size"] = page_size
        return result

    try:
        result = shadow_client.run_sql(query)
    except Exception as e:
        _audit(db, admin_username, query, False, None, str(e))
        raise
    _audit(db, admin_username, query, True, result.get("rowcount"), None)
    result["total"] = None
    result["page"] = 1
    result["page_size"] = page_size
    return result


def _try_paginate(query: str, page: int, page_size: int) -> tuple[str, int] | None:
    """If `query` is SELECT-shaped (wrapping it as a subquery is valid SQL),
    returns (a LIMIT/OFFSET-wrapped version of it, the total row count) —
    otherwise (an INSERT/UPDATE/DELETE/DDL/... statement, or anything else
    that doesn't nest as a subquery) returns None, meaning "run it exactly
    as typed, there's nothing to page." SQLite's own parser decides this —
    no keyword-sniffing — so it's automatically right about CTEs (`WITH`),
    unusual whitespace/comments, and every other real-world SELECT shape.
    A failure here is expected and silent, never audited: it just means
    this particular query isn't a row-returning one, not that anything
    went wrong."""
    stripped = query.strip()
    if stripped.endswith(";"):
        stripped = stripped[:-1].strip()
    if not stripped:
        return None

    try:
        count_result = shadow_client.run_sql(
            f"SELECT COUNT(*) AS __bo_count FROM ({stripped}) AS __bo_probe"
        )
        total = count_result["rows"][0]["__bo_count"]
    except Exception:
        return None

    offset = (page - 1) * page_size
    rows_query = f"SELECT * FROM ({stripped}) AS __bo_page LIMIT {page_size} OFFSET {offset}"
    return rows_query, total


def _backup_run_sql(filename: str) -> RunSql:
    return lambda query: shadow_client.run_backup_sql(filename, query)


def list_backup_tables(filename: str) -> list[dict]:
    """Browse a specific backup file, read-only — reuses list_tables()'s
    exact schema/row-count logic, just pointed at the backup via a closure
    instead of the live database."""
    return list_tables(_backup_run_sql(filename))


def get_backup_rows(filename: str, table_name: str, page: int, page_size: int, search: str) -> dict:
    return get_rows(table_name, page, page_size, search, _backup_run_sql(filename))


def get_backup_row(filename: str, table_name: str, pk: dict) -> dict | None:
    return get_row(table_name, pk, _backup_run_sql(filename))


def restore_backup(db: Session, filename: str, admin_username: str) -> dict:
    """Overwrites the live shadow.db with a backup — the single most
    destructive action this whole admin panel exposes, so unlike the
    simpler backup passthroughs (list/create/download) this one gets a
    real audit trail entry, same as every row edit and raw query."""
    pseudo_query = f"RESTORE BACKUP {filename}"
    try:
        result = shadow_client.restore_backup(filename)
    except Exception as e:
        _audit(db, admin_username, pseudo_query, False, None, str(e))
        raise
    _audit(db, admin_username, pseudo_query, True, None, None)
    return result


def delete_backup(db: Session, filename: str, admin_username: str) -> dict:
    """Permanently removes a backup file — irreversible, so it's audited
    the same as restore, unlike the simpler list/create/download
    passthroughs."""
    pseudo_query = f"DELETE BACKUP {filename}"
    try:
        result = shadow_client.delete_backup(filename)
    except Exception as e:
        _audit(db, admin_username, pseudo_query, False, None, str(e))
        raise
    _audit(db, admin_username, pseudo_query, True, None, None)
    return result
