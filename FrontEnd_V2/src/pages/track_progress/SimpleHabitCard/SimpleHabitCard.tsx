import type { SimpleHabitData } from "@/pages/track_progress/trackProgress.types";
import "./SimpleHabitCard.scss";

// ── Mini Heatmap ──────────────────────────────────────────────────────────────

const DAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];

function MiniHeatmap({
  history,
  doneToday,
  color,
}: {
  history: boolean[];
  doneToday: boolean;
  color: string;
}) {
  // history[0..27] = 28 days ago → yesterday; doneToday = today
  // Display as 4 rows of 7 days each (row 0 = oldest)
  const allDays = [...history, doneToday]; // 29 items: use last 28 for display
  const displayDays = allDays.slice(-28);  // always show 28 cells: 4 × 7

  return (
    <div className="tp-heatmap" aria-label="28-day completion history">
      <div className="tp-heatmap-header">
        {DAY_INITIALS.map((d, i) => (
          <span key={i} className="tp-heatmap-day">{d}</span>
        ))}
      </div>
      {[0, 1, 2, 3].map(week => (
        <div key={week} className="tp-heatmap-row">
          {[0, 1, 2, 3, 4, 5, 6].map(day => {
            const idx = week * 7 + day;
            const done = displayDays[idx];
            const isToday = idx === 27;
            return (
              <div
                key={day}
                className={[
                  "tp-heatmap-cell",
                  done ? `tp-heatmap-cell--done tp-heatmap-cell--${color}` : "tp-heatmap-cell--miss",
                  isToday ? "tp-heatmap-cell--today" : "",
                ].join(" ").trim()}
                style={{ animationDelay: `${idx * 18}ms` }}
                aria-label={done ? "completed" : "missed"}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SimpleHabitCard({ habit: h }: { habit: SimpleHabitData }) {
  const allDays = [...h.history, h.done_today];
  const done28 = allDays.slice(-28).filter(Boolean).length;
  const monthPct = Math.round((done28 / 28) * 100);

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
            <span className={`tp-sc-cat tp-sc-cat--${h.color}`}>{h.category}</span>
          </div>
        </div>

        {/* ── Heatmap ── */}
        <MiniHeatmap history={h.history} doneToday={h.done_today} color={h.color} />

      </div>

      {/* ── Footer ── */}
      <div className="tp-sc-footer">
        <div className="tp-sc-fstat">
          <span className="tp-sc-fval">{monthPct}%</span>
          <span className="tp-sc-fkey">This month</span>
        </div>
        <div className="tp-sc-fsep" />
        <div className="tp-sc-fstat">
          <span className="tp-sc-fval">{h.max_streak}<em>d</em></span>
          <span className="tp-sc-fkey">Best streak</span>
        </div>
        <div className="tp-sc-fsep" />
        <div className="tp-sc-fstat">
          <span className="tp-sc-fval">{done28}</span>
          <span className="tp-sc-fkey">Days done</span>
        </div>
      </div>
    </article>
  );
}
