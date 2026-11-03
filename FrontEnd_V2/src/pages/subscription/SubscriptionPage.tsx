import { useCallback, useEffect, useState } from "react";

import { api, ApiError, type SubscriptionOverview, type SubscriptionPlan } from "@/api";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { IllustratedErrorState } from "@/components/ui/IllustratedErrorState/IllustratedErrorState";
import { useDateFormat } from "@/context/PlannerContext";
import { useToast } from "@/context/ToastContext";
import { useWakeRefresh } from "@/hooks/useWakeRefresh";
import { PlanCard } from "@/pages/subscription/PlanCard/PlanCard";
import { formatRupees } from "@/pages/subscription/SubscriptionPage.constants";
import { UsageMeter } from "@/pages/subscription/UsageMeter/UsageMeter";
import { formatDisplayDate, istIsoDay } from "@/services/date.service";

export function SubscriptionPage() {
  const toast = useToast();
  const dateFormat = useDateFormat();
  const [overview, setOverview] = useState<SubscriptionOverview | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [choosing, setChoosing] = useState<SubscriptionPlan | null>(null);
  const [buying, setBuying] = useState(false);

  const load = useCallback(async () => {
    try {
      setOverview(await api.subscription.get());
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);
  useWakeRefresh(() => void load());

  async function buy(plan: SubscriptionPlan) {
    setBuying(true);
    try {
      setOverview(await api.subscription.purchase(plan.code));
      setChoosing(null);
      toast.success(`${plan.name} is active.`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't start the purchase. Please try again.");
    } finally {
      setBuying(false);
    }
  }

  if (!overview) {
    return (
      <section className="subscription-page">
        {loadFailed ? <IllustratedErrorState onRetry={() => void load()} /> : <p className="text-body-secondary">Loading your plan…</p>}
      </section>
    );
  }

  const { plan, allowance } = overview;

  return (
    <section className="subscription-page d-flex flex-column gap-3">
      <header>
        <h1 className="h4 mb-1">Plans</h1>
        <p className="text-body-secondary mb-0">AI features run on a monthly allowance. Everything else in Shadow is free on every plan.</p>
      </header>

      <div className="surface p-3 d-flex flex-column gap-2">
        <div className="d-flex flex-wrap justify-content-between align-items-baseline gap-2">
          <strong>{plan.name} plan</strong>
          {overview.expires_at && (
            <span className="small text-body-secondary">Runs until {formatDisplayDate(istIsoDay(overview.expires_at), dateFormat)}</span>
          )}
        </div>
        <UsageMeter used={allowance.used_tokens} limit={allowance.monthly_tokens} />
        <p className="small text-body-secondary mb-0">
          Resets on {formatDisplayDate(allowance.resets_on, dateFormat)}.
          {overview.own_api_key && " You're using your own AI key, so its usage isn't counted here."}
        </p>
      </div>

      {!overview.payments_enabled && (
        <p className="small surface p-3 mb-0">Online payments aren't set up yet, so plans can't be bought right now. The free plan keeps working.</p>
      )}

      <div className="row row-cols-1 row-cols-md-2 row-cols-xl-4 g-3">
        {overview.plans.map((option) => (
          <div className="col" key={option.code}>
            <PlanCard
              plan={option}
              current={option.code === plan.code}
              canBuy={overview.payments_enabled}
              onChoose={() => setChoosing(option)}
            />
          </div>
        ))}
      </div>

      <ConfirmDialog
        show={choosing !== null}
        title={choosing ? `Subscribe to ${choosing.name}?` : ""}
        message={
          choosing
            ? `${formatRupees(choosing.price_paise)} for ${overview.plan_duration_days} days. It gives you ${choosing.monthly_tokens.toLocaleString("en-IN")} AI tokens a month.`
            : undefined
        }
        confirmLabel="Subscribe"
        busy={buying}
        onConfirm={() => {
          if (choosing) void buy(choosing);
        }}
        onCancel={() => setChoosing(null)}
      />
    </section>
  );
}
