from fastapi import APIRouter, Depends

from app.api.deps import get_current_user
from app.core.endpoints import ENDPOINTS
from app.db.session import get_db
from app.models.user import UserDBM
from app.schemas.subscription import PurchaseRequest, SubscriptionOverviewResponse
from app.services import subscription_service

router = APIRouter(prefix=ENDPOINTS.SUBSCRIPTION.PREFIX, tags=["subscription"])


@router.get(ENDPOINTS.SUBSCRIPTION.ROOT, response_model=SubscriptionOverviewResponse)
def get_subscription(db=Depends(get_db), current_user: UserDBM = Depends(get_current_user)) -> SubscriptionOverviewResponse:
    return subscription_service.overview(db, current_user)


@router.post(ENDPOINTS.SUBSCRIPTION.PURCHASE, response_model=SubscriptionOverviewResponse)
def purchase_plan(
    request: PurchaseRequest, db=Depends(get_db), current_user: UserDBM = Depends(get_current_user)
) -> SubscriptionOverviewResponse:
    return subscription_service.purchase_plan(db, current_user, request.plan_code)
