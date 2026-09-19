import asyncio
import logging

from fastapi import APIRouter, Depends, Header, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.endpoints import ENDPOINTS
from app.db.session import SessionLocal, get_db
from app.models.user import UserDBM
from app.schemas.notifications import (
    DailyBriefResponse,
    DeviceConnectedAlertRequest,
    NotificationResponse,
    PushPublicKeyResponse,
    PushSubscriptionRequest,
)
from app.services import notifications_service, push_service

logger = logging.getLogger(__name__)

# Set by the lifespan shutdown hook so all active SSE generators exit promptly.
_shutdown = asyncio.Event()


def signal_shutdown() -> None:
    _shutdown.set()


def reset_shutdown() -> None:
    _shutdown.clear()


router = APIRouter(prefix=ENDPOINTS.NOTIFICATIONS.PREFIX, tags=["Notifications"])


@router.get("", response_model=list[NotificationResponse])
def list_notifications(
    unread_only: bool = False,
    limit: int = Query(default=50, ge=1, le=200),
    before_id: int | None = Query(default=None),
    current_user: UserDBM = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return notifications_service.list_notifications(
        db, current_user,
        unread_only=unread_only,
        limit=limit,
        before_id=before_id,
    )


@router.delete(ENDPOINTS.NOTIFICATIONS.DETAIL, status_code=204)
def delete_notification(
    notification_id: int,
    current_user: UserDBM = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    notifications_service.delete_notification(db, current_user, notification_id)


@router.patch(ENDPOINTS.NOTIFICATIONS.MARK_READ, response_model=NotificationResponse)
def mark_read(
    notification_id: int,
    current_user: UserDBM = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return notifications_service.mark_read(db, current_user, notification_id)


class MarkReadBatchRequest(BaseModel):
    ids: list[int]


@router.patch(ENDPOINTS.NOTIFICATIONS.MARK_READ_BATCH)
def mark_read_batch(
    body: MarkReadBatchRequest,
    current_user: UserDBM = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    notifications_service.mark_read_batch(db, current_user, body.ids)
    return {"message": "Notifications marked as read."}


@router.patch(ENDPOINTS.NOTIFICATIONS.MARK_ALL_READ)
def mark_all_read(
    current_user: UserDBM = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    notifications_service.mark_all_read(db, current_user)
    return {"message": "All notifications marked as read."}


@router.get(ENDPOINTS.NOTIFICATIONS.STREAM)
async def stream_notifications(
    request: Request,
    since_id: int = Query(default=0),
    current_user: UserDBM = Depends(get_current_user),
):
    """
    SSE endpoint — auth via the standard Authorization Bearer header (fetch-based client).
    No token in the URL. The injected DB session is NOT used here — a short-lived session
    resolves `effective_since` immediately so the pool connection is released before streaming.
    """
    user_id = current_user.id
    with SessionLocal() as seed_db:
        effective_since = since_id if since_id > 0 else notifications_service.get_latest_id(seed_db, user_id)

    async def generator():
        last_id = effective_since
        elapsed_s = 0
        # Force a reconnect every 20 min so a stalled/orphaned client can never
        # pin server resources indefinitely; the frontend already auto-reconnects.
        max_duration_s = 20 * 60
        while elapsed_s < max_duration_s:
            try:
                await asyncio.wait_for(_shutdown.wait(), timeout=5)
                break  # server is shutting down
            except asyncio.TimeoutError:
                pass   # normal tick
            elapsed_s += 5
            if await request.is_disconnected():
                break
            try:
                with SessionLocal() as tick_db:
                    new_notifs = notifications_service.get_notifications_since(tick_db, user_id, last_id)
                    for n in new_notifs:
                        last_id = max(last_id, n.id)
                        payload = NotificationResponse.model_validate(n).model_dump_json()
                        yield f"data: {payload}\n\n"
            except Exception:
                logger.exception("SSE tick error for user %d", user_id)
            yield ": heartbeat\n\n"

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ─── Web Push endpoints ───────────────────────────────────────────────────────

@router.get(ENDPOINTS.NOTIFICATIONS.PUSH_PUBLIC_KEY, response_model=PushPublicKeyResponse)
def get_push_public_key():
    key = push_service.get_public_key()
    if not key:
        from fastapi import HTTPException
        raise HTTPException(status_code=503, detail="Push notifications are not configured on this server.")
    return PushPublicKeyResponse(public_key=key)


@router.post(ENDPOINTS.NOTIFICATIONS.PUSH_SUBSCRIBE, status_code=201)
def subscribe_push(
    body: PushSubscriptionRequest,
    user_agent: str | None = Header(default=None),
    current_user: UserDBM = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    push_service.save_subscription(
        db,
        current_user,
        endpoint=body.endpoint,
        p256dh=body.p256dh,
        auth=body.auth,
        user_agent=body.user_agent or user_agent,
    )
    return {"message": "Subscribed."}


@router.delete(ENDPOINTS.NOTIFICATIONS.PUSH_UNSUBSCRIBE, status_code=204)
def unsubscribe_push(
    body: PushSubscriptionRequest,
    current_user: UserDBM = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    push_service.remove_subscription(db, current_user, body.endpoint)


@router.get(ENDPOINTS.NOTIFICATIONS.EMAIL_UNSUBSCRIBE, response_class=None)
def email_unsubscribe(
    uid: int,
    token: str,
    db: Session = Depends(get_db),
):
    """One-click unsubscribe link embedded in notification emails.

    Verifies the HMAC token, flips email_notifications_enabled to False, and
    returns a plain HTML confirmation page (no auth cookie required).
    """
    from fastapi.responses import HTMLResponse
    from sqlalchemy import select
    from app.models.user import UserDBM
    from app.models.user_setting import UserSettingDBM
    from app.services.email_notification_service import verify_unsub_token

    user = db.scalar(select(UserDBM).where(UserDBM.id == uid))
    if not user or not verify_unsub_token(uid, user.email, token):
        return HTMLResponse(
            content=_unsub_page("Invalid or expired unsubscribe link.", success=False),
            status_code=400,
        )

    row = db.scalar(select(UserSettingDBM).where(UserSettingDBM.user_id == uid))
    if row and row.notifications:
        prefs = dict(row.notifications)
        prefs["email_notifications_enabled"] = False
        row.notifications = prefs
        db.commit()

    return HTMLResponse(content=_unsub_page(f"You have been unsubscribed. {user.name.split()[0]}, you will no longer receive email notifications from Shadow. You can re-enable them in your account settings."))


def _unsub_page(message: str, success: bool = True) -> str:
    color = "#22c55e" if success else "#ef4444"
    icon = "&#10003;" if success else "&#9888;"
    return f"""<!doctype html><html><head><meta charset="utf-8"><title>Shadow — Unsubscribe</title>
<style>body{{margin:0;background:#efeff7;font-family:Verdana,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh}}
.box{{background:#fff;border-radius:12px;border:1px solid #e5e7eb;padding:40px 36px;max-width:420px;text-align:center}}
.icon{{font-size:42px;color:{color}}}h2{{margin:16px 0 8px;color:#111827}}p{{color:#4b5563;font-size:14px;line-height:1.6}}</style></head>
<body><div class="box"><div class="icon">{icon}</div><h2>Shadow Notifications</h2><p>{message}</p></div></body></html>"""


@router.get(ENDPOINTS.NOTIFICATIONS.DAILY_BRIEF, response_model=DailyBriefResponse)
def get_daily_brief(
    date: str | None = Query(default=None, description="YYYY-MM-DD — defaults to today (IST)"),
    current_user: UserDBM = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from datetime import date as date_type
    from app.common import today_ist
    from app.services.daily_brief_service import get_brief_for_date

    if date:
        try:
            target = date_type.fromisoformat(date)
        except ValueError:
            from fastapi import HTTPException
            raise HTTPException(status_code=422, detail="Invalid date format — expected YYYY-MM-DD.")
    else:
        target = today_ist()

    return get_brief_for_date(db, current_user.id, target)


@router.post(ENDPOINTS.NOTIFICATIONS.DAILY_BRIEF_GENERATE, response_model=DailyBriefResponse)
async def generate_daily_brief_now(
    date: str = Query(description="YYYY-MM-DD — must be today (IST)"),
    current_user: UserDBM = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from datetime import date as date_type
    from app.services.daily_brief_service import generate_brief_now

    try:
        target = date_type.fromisoformat(date)
    except ValueError:
        from fastapi import HTTPException
        raise HTTPException(status_code=422, detail="Invalid date format — expected YYYY-MM-DD.")

    return await generate_brief_now(db, current_user, target)


@router.post(ENDPOINTS.NOTIFICATIONS.PUSH_DEVICE_CONNECTED_ALERT)
def device_connected_alert(
    body: DeviceConnectedAlertRequest,
    current_user: UserDBM = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Send a push notification to all OTHER devices of this user to inform them a new device connected."""
    push_service.send_push_to_user(
        db,
        user_id=current_user.id,
        title="New device connected",
        body="Push notifications are now active on another device.",
        url="/settings",
        exclude_endpoint=body.endpoint,
    )
    return {"message": "Alert sent."}
