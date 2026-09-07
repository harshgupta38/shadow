import type { DailyReportDetail } from "@/api";
import "./YesterdayClosingPanel.scss";

const TONE_EMOJI: Record<DailyReportDetail["closing"]["tone"], string> = {
  celebrate: "🎉",
  motivate: "💪",
  guide: "🧭",
};

// The message was written from yesterday's point of view, so "tomorrow" means today —
// drop the word here rather than showing yesterday's "tomorrow" on today's page.
function withoutTomorrow(message: string): string {
  let text = message.replace(/^\s*tomorrow\s*,\s*/i, "");
  if (text !== message) text = text.charAt(0).toUpperCase() + text.slice(1);
  return text
    .replace(/\btomorrow\b/gi, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
}

interface Props {
  /** Yesterday's daily-report closing, from the plan response — null if none exists yet. */
  closing: DailyReportDetail["closing"] | null;
}

export function YesterdayClosingPanel({ closing }: Props) {
  // No report for yesterday yet (not generated, or genuinely nothing to show) — stay out of the way.
  if (!closing) return null;

  return (
    <section className="plan-panel yesterday-closing-panel">
      <span className="ycp-icon" aria-hidden="true">{TONE_EMOJI[closing.tone]}</span>
      <div className="ycp-body">
        <span className="ycp-label">From yesterday</span>
        <p className="ycp-message">{withoutTomorrow(closing.message)}</p>
      </div>
    </section>
  );
}
