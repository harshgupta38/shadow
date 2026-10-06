"""Bumps the shared data version whenever a transaction writes user data.

The response cache (app/core/response_cache.py) can only trust an entry while the version it was
stored under is still current, so *every* kind of write must move it: ORM objects, bulk
update()/delete() statements and raw SQL text. Hooking the Session means no service has to
remember to invalidate anything.

The bump is executed inside the writing transaction. It commits and rolls back together with the
data, so another worker can never observe new data under an old version or the reverse.
"""
import re
from itertools import chain

from sqlalchemy import event, text  # pyright: ignore[reportMissingImports]
from sqlalchemy.orm import ORMExecuteState, Session, sessionmaker  # pyright: ignore[reportMissingImports]
from sqlalchemy.sql.elements import TextClause  # pyright: ignore[reportMissingImports]

from app.models.data_version import DATA_VERSION_ROW_ID, DataVersionDBM

# Writes to these tables never change anything a cached response contains: the version row itself,
# and per-request session/rate-limit bookkeeping that would otherwise invalidate every few minutes.
# Everything else bumps the version, so a new table is covered by default.
IGNORED_TABLES = frozenset({DataVersionDBM.__tablename__, "active_sessions", "ip_rate_limits"})

_BUMPED_FLAG = "data_version_bumped"

_BUMP_SQL = text(
    f"INSERT INTO {DataVersionDBM.__tablename__} (id, version) VALUES ({DATA_VERSION_ROW_ID}, 1) "
    f"ON CONFLICT (id) DO UPDATE SET version = {DataVersionDBM.__tablename__}.version + 1"
)

_RAW_WRITE = re.compile(
    r"\s*(?:INSERT(?:\s+OR\s+\w+)?\s+INTO|REPLACE\s+INTO|UPDATE|DELETE\s+FROM)\s+[\"`\[]?(\w+)",
    re.IGNORECASE,
)


def _bump_once(session: Session) -> None:
    # One increment per transaction is enough: readers only see it once the transaction commits.
    if session.info.get(_BUMPED_FLAG):
        return
    session.connection().execute(_BUMP_SQL)
    session.info[_BUMPED_FLAG] = True


def _on_execute(state: ORMExecuteState) -> None:
    if state.is_select:
        return

    statement = state.statement
    if isinstance(statement, TextClause):
        match = _RAW_WRITE.match(statement.text)
        if match is None:
            return  # a read or a PRAGMA, not a write
        table_name = match.group(1)
    elif state.is_insert or state.is_update or state.is_delete:
        table_name = getattr(getattr(statement, "table", None), "name", None)
    else:
        return

    # An unknown table is treated as relevant: a needless bump costs a cache miss, a missed one
    # serves stale data.
    if table_name in IGNORED_TABLES:
        return
    _bump_once(state.session)


def _on_flush(session: Session, flush_context) -> None:
    if session.info.get(_BUMPED_FLAG):
        return
    for instance in chain(session.new, session.dirty, session.deleted):
        if getattr(instance, "__tablename__", None) not in IGNORED_TABLES:
            _bump_once(session)
            return


def _on_transaction_end(session: Session, transaction) -> None:
    # Flushes run in internal sub-transactions that end constantly; only the real transaction or a
    # savepoint (whose rollback discards the bump, so the next write must bump again) matters here.
    if transaction.parent is None or transaction.nested:
        session.info.pop(_BUMPED_FLAG, None)


def register_change_tracking(session_factory: sessionmaker) -> None:
    event.listen(session_factory, "do_orm_execute", _on_execute)
    event.listen(session_factory, "after_flush", _on_flush)
    event.listen(session_factory, "after_transaction_end", _on_transaction_end)
