from datetime import date, datetime

from pydantic import BaseModel


class PlanResponse(BaseModel):
    code: str
    name: str
    daily_tokens: int
    price_paise: int
    tagline: str


class AllowanceResponse(BaseModel):
    used_tokens: int
    daily_tokens: int
    resets_on: date  # tomorrow (IST)


class SubscriptionOverviewResponse(BaseModel):
    plan: PlanResponse  # the plan the person is on now
    expires_at: datetime | None  # when a paid plan runs out; None on the free plan
    allowance: AllowanceResponse
    own_api_key: bool  # AI calls made with the person's own key are not counted
    plans: list[PlanResponse]
    plan_duration_days: int  # how long one purchase keeps a paid plan
    payments_enabled: bool  # False until a payment gateway is connected


class PurchaseRequest(BaseModel):
    plan_code: str
