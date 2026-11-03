import type { ComponentType } from "react";
import { Check2Circle, Gem, LightningChargeFill, Stars, type IconProps } from "react-bootstrap-icons";

import type { SubscriptionPlan } from "@/api";
import { formatRupees, type PlanFeature } from "@/pages/subscription/SubscriptionPage.constants";
import "./PlanCard.scss";

const PLAN_ICONS: Record<string, ComponentType<IconProps>> = {
  starter: Stars,
  plus: LightningChargeFill,
  pro: Gem,
};

interface PlanCardProps {
  plan: SubscriptionPlan;
  features: PlanFeature[];
  /** Names of the cheaper plans whose features this plan also includes. Empty for the first plan. */
  includes: string[];
  current: boolean;
  canBuy: boolean;
  onChoose: () => void;
}

export function PlanCard({ plan, features, includes, current, canBuy, onChoose }: PlanCardProps) {
  const Icon = PLAN_ICONS[plan.code] ?? Stars;

  return (
    <div className={`pc pc--${plan.code} surface p-3 h-100 d-flex flex-column gap-3${current ? " border border-2 border-primary" : ""}`}>
      <div className="d-flex align-items-center gap-2">
        <span className="pc-icon">
          <Icon aria-hidden="true" />
        </span>
        <div className="flex-grow-1">
          <h2 className="h6 fw-bold mb-0">{plan.name}</h2>
          <p className="pc-tagline small text-body-secondary mb-0">{plan.tagline}</p>
        </div>
        {current && <span className="pill">Current</span>}
      </div>

      <p className="mb-0">
        <span className="pc-price">{formatRupees(plan.price_paise)}</span>
        <span className="small text-body-secondary"> / month</span>
      </p>

      <p className="pc-allowance mb-0">
        <Stars aria-hidden="true" />
        <span>
          <strong>{plan.daily_tokens.toLocaleString("en-IN")}</strong> AI tokens a day
        </span>
      </p>

      <div className="d-flex flex-column gap-2">
        <p className="pc-includes mb-0">{includes.length > 0 ? `Everything in ${includes.join(" and ")} +` : "Includes"}</p>
        <ul className="list-unstyled mb-0 d-flex flex-column gap-2">
          {features.map((feature) => (
            <li key={feature.name} className="pc-feature">
              <Check2Circle className="pc-feature-check" size={15} aria-hidden="true" />
              <span>
                {feature.name}
                <span className="pc-feature-hint">{feature.hint}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-auto">
        {current ? (
          <button type="button" className="btn btn-soft btn-sm w-100" disabled>
            Current plan
          </button>
        ) : (
          <button type="button" className="btn btn-brand btn-sm w-100" disabled={!canBuy} onClick={onChoose}>
            {canBuy ? `Choose ${plan.name}` : "Coming soon"}
          </button>
        )}
      </div>
    </div>
  );
}
