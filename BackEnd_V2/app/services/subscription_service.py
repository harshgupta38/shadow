"""Plans, the daily AI allowance and plan purchases.

Every AI call made with the app's own keys counts its input and output tokens against the person's allowance for the
current day (IST). Calls made with the person's own API key are not counted: that key is paid for directly.
Everything that does not call an AI model is free on every plan.

The plan lives on the user row (plan_code, plan_expires_at), so every account has one and BackOffice can change it with an UPDATE.
"""

import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.common import as_utc, today_ist
from app.core.config import settings
from app.core.exceptions import ServiceUnavailableError, TokenLimitReachedError, ValidationError
from app.db.session import SessionLocal
from app.models.daily_usage import DailyUsageDBM
from app.models.subscription_payment import SubscriptionPaymentDBM
from app.models.user import UserDBM
from app.schemas.subscription import AllowanceResponse, PlanResponse, SubscriptionOverviewResponse
from app.services import notifications_service, settings_service
from app.services.subscription_plans import FREE_PLAN, PAID_PLANS, PLAN_DURATION_DAYS, PLANS, Plan

PLAN_DURATION = timedelta(days=PLAN_DURATION_DAYS)
TEST_PROVIDER = "test"


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def current_plan(user: UserDBM) -> tuple[Plan, datetime | None]:
    """The plan the person is on now, and when a paid plan runs out (None when it never does). A plan that has run out, or a code
    that is not a paid plan (a typo from BackOffice), reads as the free plan, so a bad edit never breaks the account."""
    plan = next((option for option in PAID_PLANS if option.code == user.plan_code), FREE_PLAN)
    if plan is FREE_PLAN:
        return FREE_PLAN, None
    if user.plan_expires_at is None:
        return plan, None
    expires_at = as_utc(user.plan_expires_at)
    return (plan, expires_at) if expires_at > _now_utc() else (FREE_PLAN, None)


def tokens_used_today(db: Session, user_id: int, today: date) -> int:
    used = db.scalar(
        select(func.coalesce(func.sum(DailyUsageDBM.input_tokens + DailyUsageDBM.output_tokens), 0)).where(
            DailyUsageDBM.user_id == user_id,
            DailyUsageDBM.usage_date == today,
        )
    )
    return int(used or 0)


def _plan_response(plan: Plan) -> PlanResponse:
    return PlanResponse(
        code=plan.code,
        name=plan.name,
        daily_tokens=plan.daily_tokens,
        price_paise=plan.price_paise,
        tagline=plan.tagline,
    )


def _uses_own_key(db: Session, user_id: int) -> bool:
    ai_behavior = settings_service.get_ai_behavior(db, user_id)
    return bool(ai_behavior.get("custom_api_key_enabled") and ai_behavior.get("custom_api_key"))


def overview(db: Session, user: UserDBM) -> SubscriptionOverviewResponse:
    today = today_ist()
    plan, expires_at = current_plan(user)
    return SubscriptionOverviewResponse(
        plan=_plan_response(plan),
        expires_at=expires_at,
        allowance=AllowanceResponse(
            used_tokens=tokens_used_today(db, user.id, today),
            daily_tokens=plan.daily_tokens,
            resets_on=today + timedelta(days=1),
        ),
        own_api_key=_uses_own_key(db, user.id),
        plans=[_plan_response(option) for option in PLANS],
        plan_duration_days=PLAN_DURATION_DAYS,
        payments_enabled=settings.subscription_test_payments,
    )


def check_ai_allowance(user_id: int) -> None:
    """Raises TokenLimitReachedError when the person has used up today's AI allowance. The LLM layer calls this before
    each AI call made with the app's own keys. The first refusal each day also leaves one notification."""
    with SessionLocal() as db:
        user = db.get(UserDBM, user_id)
        if user is None:
            return
        today = today_ist()
        plan, _ = current_plan(user)
        if tokens_used_today(db, user_id, today) < plan.daily_tokens:
            return

        hint = " Subscribe under Profile for more." if plan == FREE_PLAN else ""
        notifications_service.create_notification(
            db, user,
            title="Your AI allowance for today is used up",
            body=f"AI features pause until tomorrow. Everything else keeps working.{hint}",
            type="system",
            level=notifications_service.LEVEL_CRITICAL,
            url="/subscription",
            event_key=f"ai_allowance:{user_id}:{today:%Y-%m-%d}",
            send_email=False,
        )
        raise TokenLimitReachedError(f"You've used today's AI allowance. AI features resume tomorrow.{hint}")


def purchase_plan(db: Session, user: UserDBM, plan_code: str) -> SubscriptionOverviewResponse:
    """Buys a paid plan. Until a payment gateway is connected, only the test switch completes a purchase, and it does so at
    once. Buying while a plan runs takes the new plan at once and adds its time after the time left on the old one."""
    plan = next((option for option in PAID_PLANS if option.code == plan_code), None)
    if plan is None:
        raise ValidationError("Choose one of the paid plans.")
    if not settings.subscription_test_payments:
        raise ServiceUnavailableError("Online payments aren't available yet. The free plan keeps working meanwhile.")

    now = _now_utc()
    payment = SubscriptionPaymentDBM(
        user_id=user.id,
        plan_code=plan.code,
        amount_paise=plan.price_paise,
        currency="INR",
        provider=TEST_PROVIDER,
        provider_ref=f"{TEST_PROVIDER}_{uuid.uuid4().hex}",
        status="paid",
        paid_at=now,
    )
    db.add(payment)
    runs_until = max(now, as_utc(user.plan_expires_at)) if user.plan_expires_at else now
    user.plan_code = plan.code
    user.plan_expires_at = runs_until + PLAN_DURATION
    db.commit()

    notifications_service.create_notification(
        db, user,
        title=f"{plan.name} plan is active",
        body=f"Your {plan.name} plan runs until {as_utc(user.plan_expires_at):%d %b %Y}.",
        type="system",
        level=notifications_service.LEVEL_INFORMATIONAL,
        url="/subscription",
        event_key=f"plan_started:{payment.provider_ref}",
        send_email=False,
    )
    return overview(db, user)
