import type { SubscriptionPlan } from "@/api";
import { formatRupees } from "@/pages/subscription/SubscriptionPage.constants";

interface PlanCardProps {
  plan: SubscriptionPlan;
  current: boolean;
  canBuy: boolean;
  onChoose: () => void;
}

export function PlanCard({ plan, current, canBuy, onChoose }: PlanCardProps) {
  const free = plan.price_paise === 0;

  return (
    <div className={`surface p-3 h-100 d-flex flex-column gap-2${current ? " border border-2 border-primary" : ""}`}>
      <div className="d-flex justify-content-between align-items-center">
        <h2 className="h6 fw-bold mb-0">{plan.name}</h2>
        {current && <span className="pill">Current</span>}
      </div>
      <p className="mb-0">
        <strong className="fs-4">{free ? "Free" : formatRupees(plan.price_paise)}</strong>
        {!free && <span className="small text-body-secondary"> / month</span>}
      </p>
      <p className="small text-body-secondary mb-0">{plan.tagline}</p>
      <p className="small mb-0">{plan.monthly_tokens.toLocaleString("en-IN")} AI tokens a month</p>
      <div className="mt-auto pt-2">
        {current ? (
          <button type="button" className="btn btn-soft btn-sm w-100" disabled>
            Current plan
          </button>
        ) : (
          !free && (
            <button type="button" className="btn btn-brand btn-sm w-100" disabled={!canBuy} onClick={onChoose}>
              {canBuy ? `Choose ${plan.name}` : "Coming soon"}
            </button>
          )
        )}
      </div>
    </div>
  );
}
