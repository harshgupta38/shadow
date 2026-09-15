"""
In-memory rate limiter for auth endpoints.

Design notes
────────────
• Single-process Termux deployment → in-memory dict is correct.  No Redis needed.
• threading.Lock ensures each state transition (check + mutate) is atomic within
  one lock acquisition.  The check and the DB auth still have a gap between them,
  but for a single-user personal app any race window is irrelevant in practice.
• State resets on server restart → running lockouts are lifted.  Acceptable
  trade-off; the goal is discouraging brute-force, not persistent punishment.

Three independent limiters
──────────────────────────
• IP login:       5 consecutive failures → 15-min lockout (cleared on success)
• Account:        5 consecutive failures → 15-min lockout (cleared on success)
• Registration:   5 successful registrations per IP per 60-minute sliding window
"""

import math
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from threading import Lock

_MAX_ATTEMPTS = 5
_LOCKOUT_MINUTES = 15

_REG_MAX_PER_WINDOW = 5
_REG_WINDOW_MINUTES = 60


# ─── Internal data types ──────────────────────────────────────────────────────

@dataclass
class _Entry:
    attempts: int = 0
    lockout_until: datetime | None = None


@dataclass
class _RegEntry:
    count: int = 0
    window_start: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


# ─── Shared helpers ───────────────────────────────────────────────────────────

def _cleanup(store: dict[str, _Entry]) -> None:
    """Evict expired lockout entries (call while holding the store's lock)."""
    now = datetime.now(timezone.utc)
    for k in [k for k, e in store.items() if e.lockout_until and e.lockout_until <= now]:
        del store[k]


def _is_locked(entry: _Entry) -> tuple[bool, int]:
    """Return (locked, remaining_seconds). Call while holding the store's lock."""
    if not entry.lockout_until:
        return False, 0
    now = datetime.now(timezone.utc)
    if now >= entry.lockout_until:
        return False, 0
    return True, math.ceil((entry.lockout_until - now).total_seconds())


def _raise_locked(remaining_secs: int, label: str) -> None:
    from app.core.exceptions import TooManyRequestsError
    mins = math.ceil(remaining_secs / 60)
    raise TooManyRequestsError(
        f"{label} Try again in {mins} minute(s).",
        retry_after=remaining_secs,
    )


# ─── IP-based login rate limiting ─────────────────────────────────────────────

_ip_store: dict[str, _Entry] = {}
_ip_lock = Lock()


def _ip_check(ip: str) -> None:
    """Raise if locked; evict if expired (call while holding _ip_lock)."""
    _cleanup(_ip_store)
    entry = _ip_store.get(ip)
    if entry:
        locked, secs = _is_locked(entry)
        if locked:
            _raise_locked(secs, "Too many failed login attempts.")
        elif entry.lockout_until:
            del _ip_store[ip]


# ─── Account lockout (per email) ──────────────────────────────────────────────

_account_store: dict[str, _Entry] = {}
_account_lock = Lock()


def _account_check(email: str) -> None:
    """Raise if locked; evict if expired (call while holding _account_lock)."""
    _cleanup(_account_store)
    entry = _account_store.get(email)
    if entry:
        locked, secs = _is_locked(entry)
        if locked:
            _raise_locked(secs, "Account temporarily locked.")
        elif entry.lockout_until:
            del _account_store[email]


# ─── Public API ───────────────────────────────────────────────────────────────

def check_login_allowed(ip: str, email: str) -> None:
    """
    Check both IP and account limiters before attempting auth.
    Raises TooManyRequestsError if either is locked out.
    Each check-and-evict is atomic within its own lock.
    """
    with _ip_lock:
        _ip_check(ip)
    with _account_lock:
        _account_check(email.strip().lower())


def on_login_failure(ip: str, email: str) -> None:
    """
    Record a failed login attempt for both IP and account.
    Each increment is atomic within its own lock.
    """
    email = email.strip().lower()
    with _ip_lock:
        entry = _ip_store.setdefault(ip, _Entry())
        entry.attempts += 1
        if entry.attempts >= _MAX_ATTEMPTS and not entry.lockout_until:
            entry.lockout_until = datetime.now(timezone.utc) + timedelta(minutes=_LOCKOUT_MINUTES)

    with _account_lock:
        entry = _account_store.setdefault(email, _Entry())
        entry.attempts += 1
        if entry.attempts >= _MAX_ATTEMPTS and not entry.lockout_until:
            entry.lockout_until = datetime.now(timezone.utc) + timedelta(minutes=_LOCKOUT_MINUTES)


def on_login_success(ip: str, email: str) -> None:
    """Clear failure counters on successful login."""
    email = email.strip().lower()
    with _ip_lock:
        _ip_store.pop(ip, None)
    with _account_lock:
        _account_store.pop(email, None)


# ─── Registration rate limiting (per IP) ──────────────────────────────────────

_reg_store: dict[str, _RegEntry] = {}
_reg_lock = Lock()


def check_registration_allowed(ip: str) -> None:
    """
    Raise TooManyRequestsError if this IP has created too many accounts in the
    current sliding window.  Check and evict-expired are atomic within _reg_lock.
    """
    from app.core.exceptions import TooManyRequestsError
    with _reg_lock:
        entry = _reg_store.get(ip)
        if entry is None:
            return
        now = datetime.now(timezone.utc)
        age = (now - entry.window_start).total_seconds()
        if age >= _REG_WINDOW_MINUTES * 60:
            del _reg_store[ip]
            return
        if entry.count >= _REG_MAX_PER_WINDOW:
            secs = math.ceil(_REG_WINDOW_MINUTES * 60 - age)
            mins = math.ceil(secs / 60)
            raise TooManyRequestsError(
                f"Too many accounts created from this address. Try again in {mins} minute(s).",
                retry_after=secs,
            )


def on_registration(ip: str) -> None:
    """Increment the registration counter for this IP within the current window."""
    with _reg_lock:
        entry = _reg_store.get(ip)
        if entry is None:
            _reg_store[ip] = _RegEntry(count=1)
        else:
            now = datetime.now(timezone.utc)
            if (now - entry.window_start).total_seconds() >= _REG_WINDOW_MINUTES * 60:
                _reg_store[ip] = _RegEntry(count=1)
            else:
                entry.count += 1
