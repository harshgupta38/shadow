import { GraphUpArrow } from "react-bootstrap-icons";

import type { ProfileResponse } from "@/api";
import { ProgressRing } from "@/components/ui/ProgressRing/ProgressRing";
import { Panel } from "@/pages/profile/Panel/Panel";
import "@/pages/profile/ThisMonthPanel/ThisMonthPanel.scss";

function ProgressBreakdownRow({ label, done, total }: { label: string; done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="pf-breakdown-row">
      <div className="pf-breakdown-top">
        <span>{label}</span>
        <span className="pf-breakdown-count">{done}/{total}</span>
      </div>
      <div className="progress" style={{ height: 6 }}>
        <div className="progress-bar" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function ThisMonthPanel({ profile }: { profile: ProfileResponse }) {
  return (
    <Panel
      icon={<GraphUpArrow size={18} />}
      tone="success"
      title="This Month"
      desc="How your alignment is trending across goals, habits, and tasks."
    >
      <div className="pf-month-body">
        <ProgressRing percentage={profile.month_alignment_percent} />
        <div className="pf-breakdown-list">
          <ProgressBreakdownRow label="Goals" done={profile.month_goals_done} total={profile.month_goals_total} />
          <ProgressBreakdownRow label="Habits" done={profile.month_habits_done} total={profile.month_habits_total} />
          <ProgressBreakdownRow label="Tasks" done={profile.month_tasks_done} total={profile.month_tasks_total} />
        </div>
      </div>
    </Panel>
  );
}
