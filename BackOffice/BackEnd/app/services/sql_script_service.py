"""Splitting a pasted SQL script into the individual statements the console runs one at a time.

A naive split on ";" breaks on a semicolon inside a string or a comment, and on a trigger body
(CREATE TRIGGER … BEGIN stmt; stmt; END;), where the semicolons are not statement ends. SQLite's own
parser already knows the difference — sqlite3.complete_statement() says whether a piece of text ends
in a real statement terminator — so it is used here instead of a hand-written tokenizer that could
disagree with the database about where a statement stops.
"""
import re
import sqlite3

from app.core.exceptions import ValidationError

MAX_SCRIPT_CHARS = 200_000
MAX_STATEMENTS = 500

# Quoted text first, so a "--" or "/*" inside a string or identifier is not mistaken for a comment;
# whatever is left after dropping the comments tells whether a piece holds any actual SQL.
_COMMENTS_OUTSIDE_QUOTES = re.compile(
    r"""('(?:[^']|'')*'|"(?:[^"]|"")*"|`[^`]*`|\[[^\]]*\])|--[^\n]*|/\*.*?(?:\*/|$)""",
    re.DOTALL,
)


def _has_code(text: str) -> bool:
    without_comments = _COMMENTS_OUTSIDE_QUOTES.sub(lambda m: m.group(1) or " ", text)
    return bool(without_comments.replace(";", " ").strip())


def split_statements(script: str) -> list[str]:
    if len(script) > MAX_SCRIPT_CHARS:
        raise ValidationError(f"That script is too long to split (over {MAX_SCRIPT_CHARS:,} characters).")

    statements: list[str] = []
    start = 0
    semicolon = script.find(";")
    while semicolon != -1:
        piece = script[start:semicolon + 1]
        if sqlite3.complete_statement(piece):
            if _has_code(piece):
                statements.append(piece.strip())
            start = semicolon + 1
        semicolon = script.find(";", semicolon + 1)

    # A last statement is allowed to omit its semicolon; trailing comments or whitespace are not one.
    tail = script[start:]
    if _has_code(tail):
        statements.append(tail.strip())

    if len(statements) > MAX_STATEMENTS:
        raise ValidationError(f"That script has {len(statements)} statements; the limit is {MAX_STATEMENTS}.")
    return statements
