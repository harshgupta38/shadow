"""The subscription plans, in one place. Prices are in paise (100 paise = ₹1).

Every AI call that uses the app's own keys counts its input and output tokens against the plan's daily allowance.
Everything that does not call an AI model is free on every plan.
"""

from dataclasses import dataclass

PLAN_DURATION_DAYS = 30


@dataclass(frozen=True)
class Plan:
    code: str
    name: str
    daily_tokens: int
    price_paise: int
    tagline: str


FREE_PLAN = Plan("free", "Free", 30_000, 0, "A taste of AI every day")
PAID_PLANS = (
    Plan("starter", "Starter", 300_000, 14_900, "Plenty of AI chats and reports every day"),
    Plan("plus", "Plus", 1_000_000, 39_900, "Daily coaching, reports and the daily brief"),
    Plan("pro", "Pro", 3_000_000, 99_900, "Heavy daily use of every AI feature"),
)
PLANS = (FREE_PLAN, *PAID_PLANS)
