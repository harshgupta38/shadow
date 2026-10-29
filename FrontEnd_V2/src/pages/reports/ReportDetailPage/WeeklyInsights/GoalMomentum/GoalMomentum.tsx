import type { WeeklyGoalMomentum } from "@/api/types";
import { TipLine, TipTitle } from "../ChartTooltip/ChartTooltip";
import { Delta } from "../Delta/Delta";
import { Sparkline } from "../Sparkline/Sparkline";
import { SPARK_SIZE, WEEKDAYS_LONG } from "../WeeklyInsights.constants";
import type { WeekLabels } from "../useWeekLabels";
import "./GoalMomentum.scss";

interface GoalMomentumProps {
  goals: WeeklyGoalMomentum[];
  labels: WeekLabels;
}

const share = (done: number, total: number) => (total > 0 ? (done / total) * 100 : 0);

export function GoalMomentum({ goals, labels }: GoalMomentumProps) {
  return (
    <div className="wi-goals">
      {goals.map((g) => {
        const gained = g.milestone_done - g.milestone_done_prev_week;
        return (
          <div key={g.id} className="wi-goal-row">
            <div className="wi-goal-main">
              <span className="wi-goal-title">{g.title}</span>
              <span className="wi-goal-milestone">{g.milestone_title}</span>
            </div>

            <Sparkline
              width={SPARK_SIZE.GOAL.width}
              height={SPARK_SIZE.GOAL.height}
              values={g.daily_pct}
              ariaLabel={`${g.title} daily alignment this week: ${g.daily_pct.map((v) => (v === null ? "none" : `${v}%`)).join(", ")}`}
              describe={(i, v) => (
                <>
                  <TipTitle>{g.title}</TipTitle>
                  <TipLine label={`${WEEKDAYS_LONG[i]}, ${labels.dayDates[i]}`} value={`${v}%`} />
                </>
              )}
            />

            <div className="wi-goal-score">
              <span className="wi-goal-pct">{g.alignment_pct}%</span>
              {g.prev_alignment_pct !== null && <Delta delta={g.alignment_pct - g.prev_alignment_pct} kind="points" />}
            </div>

            <div className="wi-goal-ms">
              <div className="wi-goal-ms-top">
                <span>{g.milestone_done}/{g.milestone_total} milestone tasks</span>
                {gained !== 0 && <strong>{gained > 0 ? "+" : ""}{gained} this week</strong>}
              </div>
              <div className="wi-goal-ms-track" aria-hidden="true">
                <span className="wi-goal-ms-gain" style={{ width: `${share(g.milestone_done, g.milestone_total)}%` }} />
                <span className="wi-goal-ms-prev" style={{ width: `${share(g.milestone_done_prev_week, g.milestone_total)}%` }} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
