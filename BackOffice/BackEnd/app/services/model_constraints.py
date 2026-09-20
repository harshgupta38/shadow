"""Validates row edits against BackEnd_V2's *actual* SQLAlchemy models,
without ever importing or copying them.

Why not just import BackEnd_V2's model modules directly? Both backends have
a top-level `app` package, so `import app.models.user` from inside
BackOffice's own process would either resolve to BackOffice's own `app`
package or produce confusing partial-module state — there's no clean way to
load a second, differently-rooted `app.*` tree into the same interpreter.
Actually executing BackEnd_V2's code here would also risk tripping its own
module-level side effects (config validation, DB connections) outside the
context that's supposed to own them.

Instead, this module statically parses the model *source files* with
Python's `ast` module — no execution, no import, so it can't fail in a way
that takes BackOffice down, and it can't drift into a stale copy since it
re-reads the real files fresh on every BackOffice startup. It intentionally
only covers what a raw admin-panel edit can get wrong in a way that would
matter to BackEnd_V2's own code: column type, nullability, string length,
and the value/range rules already spelled out in each table's
CheckConstraints. It does not (and cannot, without a live query) enforce
UNIQUE/ForeignKey — SQLite already rejects those at write time regardless,
just with a blunter error message.
"""

import ast
import logging
import re
from dataclasses import dataclass, field
from pathlib import Path

logger = logging.getLogger(__name__)

# ─── What we remember per column / table ───────────────────────────────────────

_PY_TYPES = {"str", "int", "float", "bool", "datetime", "date", "json"}

# SQLAlchemy type-call name -> our canonical type. Only types actually used
# by BackEnd_V2's models today, plus a couple of harmless extras in case a
# new column ever uses them.
_SQL_TYPE_MAP = {
    "String": "str", "Text": "str", "Unicode": "str", "UnicodeText": "str",
    "Integer": "int", "BigInteger": "int", "SmallInteger": "int",
    "Boolean": "bool",
    "DateTime": "datetime",
    "Date": "date",
    "JSON": "json",
    "Float": "float", "Numeric": "float",
}

# Bare Python-type annotation name -> our canonical type (used when
# mapped_column() has no recognizable SQL type call, e.g. `mapped_column(
# primary_key=True)` or `mapped_column(ForeignKey(...))` — the real type
# lives only in the `Mapped[...]` slice in that case).
_ANNOTATION_TYPE_MAP = {
    "str": "str", "int": "int", "float": "float", "bool": "bool",
    "datetime": "datetime", "date": "date",
    "dict": "json", "list": "json",
}


@dataclass
class ColumnConstraint:
    py_type: str
    nullable: bool
    max_length: int | None = None
    allowed_values: frozenset[str] | None = None
    min_value: float | None = None
    max_value: float | None = None
    # Only set when py_type == "json" — which flavor of JSON this column's
    # own Mapped[...] annotation declares, so the frontend can offer a
    # structured editor instead of a raw-text box for the shapes that are
    # well-defined enough to build one for.
    json_shape: str | None = None  # "list_str" | "list_int" | "list" | "dict" | None


@dataclass
class CrossColumnCheck:
    left: str
    op: str  # one of >=, <=, >, <, =
    right: str
    nullable_guard: bool  # True if either side being NULL exempts the row


@dataclass
class TableConstraints:
    columns: dict[str, ColumnConstraint] = field(default_factory=dict)
    cross_column: list[CrossColumnCheck] = field(default_factory=list)


# ─── Module state ───────────────────────────────────────────────────────────────

_registry: dict[str, TableConstraints] = {}
_load_error: str | None = None
_loaded_from: str | None = None


def get_json_shape(table_name: str, column_name: str) -> str | None:
    """Lets the frontend ask "what kind of JSON is this?" so it can offer a
    structured list editor for the well-defined shapes instead of raw text."""
    table = _registry.get(table_name)
    if table is None:
        return None
    constraint = table.columns.get(column_name)
    if constraint is None:
        return None
    return constraint.json_shape


def validate_row(table_name: str, data: dict) -> dict[str, str]:
    """Returns {column: message} for every value in `data` that violates
    BackEnd_V2's own model for this table — empty if everything's fine, or
    if this table isn't one we could find/parse a model for (fail open:
    a table BackOffice doesn't recognize just isn't schema-checked here,
    it isn't blocked)."""
    table = _registry.get(table_name)
    if table is None:
        return {}

    errors: dict[str, str] = {}
    for col, value in data.items():
        constraint = table.columns.get(col)
        if constraint is None:
            continue
        message = _check_value(col, value, constraint)
        if message:
            errors[col] = message

    for check in table.cross_column:
        if check.left not in data or check.right not in data:
            continue
        if check.left in errors or check.right in errors:
            continue  # don't pile a cross-field error on top of an already-invalid value
        left, right = data[check.left], data[check.right]
        if check.nullable_guard and (left is None or right is None):
            continue
        message = _check_cross_column(check, left, right)
        if message:
            errors[check.left] = message

    return errors


def _check_value(col: str, value, c: ColumnConstraint) -> str | None:
    if value is None:
        return None if c.nullable else f"{col} is required."

    if c.py_type == "bool":
        if not isinstance(value, bool):
            return f"{col} must be true or false."
        return None

    if c.py_type in ("int", "float"):
        number = _coerce_number(value)
        if number is None:
            return f"{col} must be a number."
        if c.py_type == "int" and isinstance(value, str) and "." in value:
            return f"{col} must be a whole number."
        if c.min_value is not None and number < c.min_value:
            return f"{col} must be at least {_fmt_num(c.min_value)}."
        if c.max_value is not None and number > c.max_value:
            return f"{col} must be at most {_fmt_num(c.max_value)}."
        return None

    if c.py_type in ("datetime", "date"):
        if not isinstance(value, str) or not _parse_date_like(value, c.py_type):
            kind = "date (YYYY-MM-DD)" if c.py_type == "date" else "date/time"
            return f"{col} must be a valid {kind}."
        return None

    if c.py_type == "json":
        return _check_json_shape(col, value, c.json_shape)

    # str / Text
    if not isinstance(value, str):
        return f"{col} must be text."
    if c.max_length is not None and len(value) > c.max_length:
        return f"{col} must be at most {c.max_length} characters (got {len(value)})."
    if c.allowed_values is not None and value not in c.allowed_values:
        allowed = ", ".join(sorted(c.allowed_values))
        return f"{col} must be one of: {allowed}."
    return None


def _check_json_shape(col: str, value, shape: str | None) -> str | None:
    if shape == "dict":
        if not isinstance(value, dict):
            return f"{col} must be an object."
        return None
    if shape in ("list", "list_str", "list_int"):
        if not isinstance(value, list):
            return f"{col} must be a list."
        if shape == "list_str" and not all(isinstance(x, str) for x in value):
            return f"{col} must be a list of text values."
        if shape == "list_int" and not all(isinstance(x, int) and not isinstance(x, bool) for x in value):
            return f"{col} must be a list of whole numbers."
        return None
    return None  # unknown/unparsed shape — any JSON value satisfies it


def _check_cross_column(check: CrossColumnCheck, left, right) -> str | None:
    left_num, right_num = _coerce_number(left), _coerce_number(right)
    if left_num is None or right_num is None:
        return None  # not comparable — a type error on the field itself already covers this
    ok = {
        ">=": left_num >= right_num, "<=": left_num <= right_num,
        ">": left_num > right_num, "<": left_num < right_num,
        "=": left_num == right_num,
    }[check.op]
    if ok:
        return None
    return f"{check.left} must be {check.op} {check.right}."


def _coerce_number(value) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            return None
    return None


def _fmt_num(n: float) -> str:
    return str(int(n)) if n == int(n) else str(n)


def _parse_date_like(value: str, py_type: str) -> bool:
    from datetime import date, datetime
    try:
        if py_type == "date":
            date.fromisoformat(value)
        else:
            datetime.fromisoformat(value.replace(" ", "T", 1))
        return True
    except ValueError:
        return False


# ─── Loading (static AST parsing — no import, no execution) ────────────────────

def load_registry(models_dir: str | Path) -> None:
    """Call once at BackOffice startup. Never raises — a parse failure just
    means this table (or, at worst, all of them) goes unchecked; it must
    never be the reason BackOffice's own server fails to start."""
    global _registry, _load_error, _loaded_from

    path = Path(models_dir).expanduser()
    _loaded_from = str(path)

    if not path.is_dir():
        _load_error = f"Model directory not found: {path}"
        _registry = {}
        logger.warning("model_constraints: %s — row-save validation disabled.", _load_error)
        return

    registry: dict[str, TableConstraints] = {}
    file_errors: list[str] = []
    for py_file in sorted(path.glob("*.py")):
        try:
            for table_name, table in _parse_model_file(py_file):
                registry[table_name] = table
        except Exception as e:  # a malformed/unexpected file must not take the others down
            file_errors.append(f"{py_file.name}: {e}")

    _registry = registry
    _load_error = "; ".join(file_errors) if file_errors else None
    logger.info(
        "model_constraints: parsed %d table(s) from %s%s",
        len(registry), path, f" ({len(file_errors)} file(s) skipped)" if file_errors else "",
    )


def _parse_model_file(path: Path) -> list[tuple[str, TableConstraints]]:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    type_aliases = _collect_type_aliases(tree)

    results: list[tuple[str, TableConstraints]] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef):
            parsed = _parse_model_class(node, type_aliases)
            if parsed is not None:
                results.append(parsed)
    return results


def _collect_type_aliases(tree: ast.Module) -> dict[str, str]:
    """Resolves `from datetime import date as date_type` etc. so a
    `Mapped[date_type]` annotation still maps to our canonical "date"."""
    aliases: dict[str, str] = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom):
            for alias in node.names:
                canonical = _ANNOTATION_TYPE_MAP.get(alias.name)
                if canonical:
                    aliases[alias.asname or alias.name] = canonical
    return aliases


def _parse_model_class(node: ast.ClassDef, type_aliases: dict[str, str]) -> tuple[str, TableConstraints] | None:
    table_name: str | None = None
    check_texts: list[str] = []
    columns: dict[str, ColumnConstraint] = {}

    for stmt in node.body:
        if isinstance(stmt, ast.Assign) and len(stmt.targets) == 1 and isinstance(stmt.targets[0], ast.Name):
            name = stmt.targets[0].id
            if name == "__tablename__" and isinstance(stmt.value, ast.Constant):
                table_name = stmt.value.value
            elif name == "__table_args__":
                check_texts.extend(_extract_check_constraint_texts(stmt.value))

        elif isinstance(stmt, ast.AnnAssign) and isinstance(stmt.target, ast.Name):
            col_name = stmt.target.id
            if col_name.startswith("__"):
                continue
            constraint = _parse_column(stmt, type_aliases)
            if constraint is not None:
                columns[col_name] = constraint

    if table_name is None or not columns:
        return None

    table = TableConstraints(columns=columns)
    for text in check_texts:
        _apply_check_constraint(table, text)
    return table_name, table


def _parse_column(stmt: ast.AnnAssign, type_aliases: dict[str, str]) -> ColumnConstraint | None:
    if not (isinstance(stmt.value, ast.Call) and _call_name(stmt.value) == "mapped_column"):
        return None  # relationship(), plain class attribute, etc. — not a real column

    annotation_nullable, annotation_type, json_shape = _resolve_annotation(stmt.annotation, type_aliases)

    py_type = annotation_type
    max_length: int | None = None
    for arg in stmt.value.args:
        if not isinstance(arg, ast.Call):
            continue
        fn_name = _call_name(arg)
        if fn_name in _SQL_TYPE_MAP:
            py_type = _SQL_TYPE_MAP[fn_name]
            if fn_name == "String" and arg.args and isinstance(arg.args[0], ast.Constant):
                max_length = arg.args[0].value
        # ForeignKey(...) and anything else positional: not a type, ignore.

    if py_type is None or py_type not in _PY_TYPES:
        return None  # couldn't determine a type we know how to validate — skip, don't guess

    nullable = annotation_nullable
    for kw in stmt.value.keywords:
        if kw.arg == "nullable" and isinstance(kw.value, ast.Constant) and isinstance(kw.value.value, bool):
            nullable = kw.value.value
        elif kw.arg == "primary_key" and isinstance(kw.value, ast.Constant) and kw.value.value is True:
            nullable = True  # PK columns are never present in edit payloads; don't require them

    return ColumnConstraint(
        py_type=py_type, nullable=nullable, max_length=max_length,
        json_shape=json_shape if py_type == "json" else None,
    )


def _resolve_annotation(node: ast.expr, type_aliases: dict[str, str]) -> tuple[bool, str | None, str | None]:
    """Mapped[X] / Mapped[X | None] -> (is_nullable, canonical_type, json_shape)."""
    if not (isinstance(node, ast.Subscript) and _name_of(node.value) == "Mapped"):
        return False, None, None
    return _resolve_type_expr(node.slice, type_aliases)


def _resolve_type_expr(node: ast.expr, type_aliases: dict[str, str]) -> tuple[bool, str | None, str | None]:
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.BitOr):
        left_null, left_type, left_shape = _resolve_type_expr(node.left, type_aliases)
        right_null, right_type, right_shape = _resolve_type_expr(node.right, type_aliases)
        return (left_null or right_null), (left_type or right_type), (left_shape or right_shape)
    if isinstance(node, ast.Constant) and node.value is None:
        return True, None, None
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return False, None, None  # forward-ref string, e.g. relationship()'s Mapped["GoalDBM | None"] — not a real column type
    if isinstance(node, ast.Subscript):
        # list[str], list[int], dict[str, Any], etc. -> JSON, with the item
        # type remembered as the shape (only list[...] item types matter for
        # the editor; dict[...]'s key/value types don't change how it's shown).
        base = _name_of(node.value)
        py_type = _ANNOTATION_TYPE_MAP.get(base or "")
        if py_type != "json":
            return False, py_type, None
        if base == "list":
            item_name = _name_of(node.slice)
            item_type = type_aliases.get(item_name or "") or _ANNOTATION_TYPE_MAP.get(item_name or "")
            shape = {"str": "list_str", "int": "list_int"}.get(item_type or "", "list")
        else:
            shape = "dict"
        return False, py_type, shape
    name = _name_of(node)
    if name:
        py_type = type_aliases.get(name) or _ANNOTATION_TYPE_MAP.get(name)
        shape = {"dict": "dict", "list": "list"}.get(name) if py_type == "json" else None
        return False, py_type, shape
    return False, None, None


def _name_of(node: ast.expr) -> str | None:
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        return node.attr
    return None


def _call_name(call: ast.Call) -> str | None:
    return _name_of(call.func)


def _extract_check_constraint_texts(node: ast.expr) -> list[str]:
    texts: list[str] = []
    if isinstance(node, ast.Tuple):
        for elt in node.elts:
            if isinstance(elt, ast.Call) and _call_name(elt) == "CheckConstraint":
                if elt.args and isinstance(elt.args[0], ast.Constant) and isinstance(elt.args[0].value, str):
                    texts.append(elt.args[0].value)
    return texts


# ─── CheckConstraint text -> constraint objects ─────────────────────────────────
# Deliberately conservative: match a handful of well-known shapes exactly and
# ignore anything else (e.g. BackEnd_V2's two fully-compound multi-column
# constraints) rather than risk mis-parsing a complex expression into a rule
# that's silently wrong — an unenforced constraint is far safer than a
# wrongly-enforced one.

_IDENT = r"[A-Za-z_]\w*"
_NUM = r"-?\d+(?:\.\d+)?"
_CMP_OPS = r">=|<=|>|<|="

_RE_NULL_OR_AND_RANGE = re.compile(
    rf"^\s*({_IDENT})\s+IS\s+NULL\s+OR\s+\(\s*\1\s*>=\s*({_NUM})\s+AND\s+\1\s*<=\s*({_NUM})\s*\)\s*$", re.I,
)
_RE_BETWEEN = re.compile(rf"^\s*({_IDENT})\s+BETWEEN\s+({_NUM})\s+AND\s+({_NUM})\s*$", re.I)
_RE_NULL_OR_IN = re.compile(rf"^\s*({_IDENT})\s+IS\s+NULL\s+OR\s+\1\s+IN\s*\(([^)]*)\)\s*$", re.I)
_RE_IN = re.compile(rf"^\s*({_IDENT})\s+IN\s*\(([^)]*)\)\s*$", re.I)
_RE_NULL_OR_CMP = re.compile(rf"^\s*({_IDENT})\s+IS\s+NULL\s+OR\s+\1\s*({_CMP_OPS})\s*({_NUM})\s*$", re.I)
_RE_CMP = re.compile(rf"^\s*({_IDENT})\s*({_CMP_OPS})\s*({_NUM})\s*$", re.I)
_RE_TWO_NULL_OR_CROSS = re.compile(
    rf"^\s*({_IDENT})\s+IS\s+NULL\s+OR\s+({_IDENT})\s+IS\s+NULL\s+OR\s+\1\s*({_CMP_OPS})\s*\2\s*$", re.I,
)
_RE_CROSS = re.compile(rf"^\s*({_IDENT})\s*({_CMP_OPS})\s*({_IDENT})\s*$", re.I)


def _apply_check_constraint(table: TableConstraints, raw_text: str) -> None:
    text = raw_text.replace('"', "")  # quoted reserved-word identifiers, e.g. "position" >= 0

    m = _RE_NULL_OR_AND_RANGE.match(text)
    if m:
        col, lo, hi = m.groups()
        if col in table.columns:
            table.columns[col].min_value = float(lo)
            table.columns[col].max_value = float(hi)
        return

    m = _RE_BETWEEN.match(text)
    if m:
        col, lo, hi = m.groups()
        if col in table.columns:
            table.columns[col].min_value = float(lo)
            table.columns[col].max_value = float(hi)
        return

    m = _RE_NULL_OR_IN.match(text)
    if m:
        col, values_text = m.groups()
        if col in table.columns:
            table.columns[col].allowed_values = _parse_value_list(values_text)
        return

    m = _RE_IN.match(text)
    if m:
        col, values_text = m.groups()
        if col in table.columns:
            table.columns[col].allowed_values = _parse_value_list(values_text)
        return

    m = _RE_NULL_OR_CMP.match(text)
    if m:
        col, op, num = m.groups()
        _apply_numeric_bound(table, col, op, float(num))
        return

    m = _RE_CMP.match(text)
    if m:
        col, op, num = m.groups()
        _apply_numeric_bound(table, col, op, float(num))
        return

    m = _RE_TWO_NULL_OR_CROSS.match(text)
    if m:
        left, right, op = m.groups()
        if left in table.columns and right in table.columns:
            table.cross_column.append(CrossColumnCheck(left=left, op=op, right=right, nullable_guard=True))
        return

    m = _RE_CROSS.match(text)
    if m:
        left, op, right = m.groups()
        if left in table.columns and right in table.columns:
            table.cross_column.append(CrossColumnCheck(left=left, op=op, right=right, nullable_guard=False))
        return

    # Anything else (BackEnd_V2 currently has 2 such constraints, both
    # compound multi-column AND/OR expressions on tasks.status /
    # tasks.simple-fields) is intentionally left unenforced here.
    logger.debug("model_constraints: could not parse CheckConstraint, skipping: %s", raw_text)


def _apply_numeric_bound(table: TableConstraints, col: str, op: str, num: float) -> None:
    if col not in table.columns:
        return
    if op in (">=", ">"):
        table.columns[col].min_value = num
    elif op in ("<=", "<"):
        table.columns[col].max_value = num
    else:
        logger.debug("model_constraints: %s = %s bound not enforced (equality isn't a min/max).", col, num)


def _parse_value_list(values_text: str) -> frozenset[str]:
    values = []
    for part in values_text.split(","):
        part = part.strip()
        if len(part) >= 2 and part[0] == part[-1] and part[0] in "'\"":
            part = part[1:-1]
        values.append(part)
    return frozenset(values)
