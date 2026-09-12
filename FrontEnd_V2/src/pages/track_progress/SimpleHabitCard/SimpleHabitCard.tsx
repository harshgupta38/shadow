import type { SimpleHabitData } from "@/api/types";
import { todayDate } from "@/services/date.service";
import { useWeekStart } from "@/context/PlannerContext";
import { dayToCol, weekDayLabels } from "@/utils/weekUtils";
import "./SimpleHabitCard.scss";

// ── Mini Heatmap ──────────────────────────────────────────────────────────────

function MiniHeatmap({ history, color }: { history: boolean[]; color: string }) {
  // history from backend: 7 entries ordered by week_starts_on (index 0 = first day of user's week)
  const weekStart = useWeekStart();
  const today = todayDate();
  const dayLetters = weekDayLabels(weekStart, "letter");
  const todayCol = dayToCol(today, weekStart);

  return (
    <div className="tp-heatmap" aria-label="This week's completion">
      <div className="tp-heatmap-header">
        {dayLetters.map((d, i) => (
          <span key={i} className="tp-heatmap-day">{d}</span>
        ))}
      </div>
      <div className="tp-heatmap-row">
        {history.map((done, idx) => (
          <div
            key={idx}
            className={[
              "tp-heatmap-cell",
              done ? `tp-heatmap-cell--done tp-heatmap-cell--${color}` : "tp-heatmap-cell--miss",
              idx === todayCol ? "tp-heatmap-cell--today" : "",
              idx > todayCol ? "tp-heatmap-cell--future" : "",
            ].filter(Boolean).join(" ")}
            style={{ animationDelay: `${idx * 18}ms` }}
            aria-label={done ? "completed" : "missed"}
          />
        ))}
      </div>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SimpleHabitCard({ habit: h }: { habit: SimpleHabitData }) {
  const done7 = h.history.filter(Boolean).length;
  const weekPct = Math.round((done7 / 7) * 100);

  const isPersonalBest = h.current_streak > 0 && h.current_streak >= h.max_streak;

  return (
    <article className={`tp-simple-card tp-simple-card--${h.color}`}>
      <div className="tp-sc-inner">

        {/* ── Head ── */}
        <div className="tp-sc-head">
          <h3 className="tp-sc-title">{h.title}</h3>
          <div className="tp-sc-badges">
            {h.current_streak > 0 && (
              <span className={`tp-sc-streak ${isPersonalBest ? "tp-sc-streak--pb" : ""}`}>
                🔥 {h.current_streak}
                {isPersonalBest && <span className="tp-sc-pb"> PB!</span>}
              </span>
            )}
            {h.category && (<span className={`tp-sc-cat tp-sc-cat--${h.color}`}>{h.category}</span>)}
          </div>
        </div>

        {/* ── Heatmap ── */}
        <MiniHeatmap history={h.history} color={h.color} />

      </div>

      {/* ── Footer ── */}
      <div className="tp-sc-footer">
        <div className="tp-sc-fstat">
          <span className="tp-sc-fval">{weekPct}%</span>
          <span className="tp-sc-fkey">This week</span>
        </div>
        <div className="tp-sc-fsep" />
        <div className="tp-sc-fstat">
          <span className="tp-sc-fval">{h.max_streak}<em>d</em></span>
          <span className="tp-sc-fkey">Best streak</span>
        </div>
        <div className="tp-sc-fsep" />
        <div className="tp-sc-fstat">
          <span className="tp-sc-fval">{done7}</span>
          <span className="tp-sc-fkey">Days done</span>
        </div>
      </div>
    </article>
  );
}
