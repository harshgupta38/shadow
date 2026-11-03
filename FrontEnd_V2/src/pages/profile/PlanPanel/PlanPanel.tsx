import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Stars } from "react-bootstrap-icons";

import { api, type SubscriptionOverview } from "@/api";
import { useDateFormat } from "@/context/PlannerContext";
import { useWakeRefresh } from "@/hooks/useWakeRefresh";
import { Panel } from "@/pages/profile/Panel/Panel";
import { UsageRing } from "@/pages/profile/PlanPanel/UsageRing/UsageRing";
import { ROUTES } from "@/routes/RoutePaths";
import { formatDisplayDate, istIsoDay } from "@/services/date.service";

// The person's plan and today's AI allowance, with a way to see every plan.
export function PlanPanel() {
  const dateFormat = useDateFormat();
  const [overview, setOverview] = useState<SubscriptionOverview | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(() => {
    api.subscription
      .get()
      .then((data) => {
        setOverview(data);
        setLoadFailed(false);
      })
      .catch(() => setLoadFailed(true));
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useWakeRefresh(load);

  const usedPercent =
    overview && overview.allowance.daily_tokens > 0 ? (overview.allowance.used_tokens / overview.allowance.daily_tokens) * 100 : 0;

  return (
    <Panel icon={<Stars size={18} />} tone="violet" title="Plan & AI allowance" desc="The AI features you can use each day. Everything else is free.">
      {loadFailed && !overview && (
        <p className="small text-body-secondary mb-0">
          Couldn't load your plan.{" "}
          <button type="button" className="btn btn-link btn-sm p-0 align-baseline" onClick={load}>
            Try again
          </button>
        </p>
      )}
      {overview && (
        <div className="d-flex flex-column gap-2">
          <div className="d-flex align-items-center justify-content-between gap-3">
            <div className="d-flex flex-column gap-1">
              <div className="d-flex flex-wrap align-items-baseline gap-2">
                <strong>{overview.plan.name} plan</strong>
                {overview.expires_at && (
                  <span className="small text-body-secondary">until {formatDisplayDate(istIsoDay(overview.expires_at), dateFormat)}</span>
                )}
              </div>
              <span className="small text-body-secondary">
                {overview.allowance.used_tokens.toLocaleString("en-IN")} of {overview.allowance.daily_tokens.toLocaleString("en-IN")} AI tokens
              </span>
            </div>
            <UsageRing percent={usedPercent} />
          </div>
          <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
            <p className="small text-body-secondary mb-0">
              Resets on {formatDisplayDate(overview.allowance.resets_on, dateFormat)}.
              {overview.own_api_key && " Calls made with your own AI key aren't counted here."}
            </p>
            <Link to={ROUTES.SUBSCRIPTION} className="btn btn-soft btn-sm">
              See plans
            </Link>
          </div>
        </div>
      )}
    </Panel>
  );
}
