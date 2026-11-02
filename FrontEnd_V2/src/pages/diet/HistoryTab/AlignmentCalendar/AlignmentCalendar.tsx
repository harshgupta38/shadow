import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ExclamationCircleFill } from "react-bootstrap-icons";

import { api } from "@/api";
import type { DietProfile, DietScoreDay } from "@/api";
import { useWeekStart } from "@/context/PlannerContext";
import { DietSkeleton } from "@/pages/diet/DietSkeleton/DietSkeleton";
import { fmt } from "@/pages/diet/DietPage.constants";
import {
  RING_CIRCUMFERENCE,
  RING_RADIUS,
  buildCells,
  statCards,
  summarize,
  type CalendarCell,
} from "@/pages/diet/HistoryTab/AlignmentCalendar/AlignmentCalendar.constants";
import { tierOf } from "@/pages/reports/ReportsPage.constants";
import { fmtMonthTitle, formatDisplayDate, monthOf, shiftMonth, todayIso } from "@/services/date.service";
import { weekDayLabels } from "@/utils/weekUtils";
import "./AlignmentCalendar.scss";

type Status = "loading" | "ready" | "error";

interface AlignmentCalendarProps {
  /** The month shown, "YYYY-MM". */
  month: string;
  profile: DietProfile;
  onChangeMonth: (month: string) => void;
  /** Opens a logged day's nutrition. */
  onOpenDay: (date: string) => void;
}

/** The month as a calendar of habit scores, so a glance shows how closely the days followed the targets. */
export function AlignmentCalendar({ month, profile, onChangeMonth, onOpenDay }: AlignmentCalendarProps) {
  const weekStart = useWeekStart();
  const today = todayIso();
  const [days, setDays] = useState<DietScoreDay[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [reloadKey, setReloadKey] = useState(0);
  const [hovered, setHovered] = useState<string | null>(null);

  const title = fmtMonthTitle(month);
  const canGoNext = month < monthOf(today);

  useEffect(() => {
    let active = true; // only the newest month may fill the calendar
    setStatus("loading");
    setDays([]);
    setHovered(null);
    void api.diet
      .getHistoryScores(month)
      .then((result) => {
        if (!active) return;
        setDays(result);
        setStatus("ready");
      })
      .catch(() => {
        if (active) setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [month, reloadKey]);

  const cells = useMemo(() => buildCells(month, today, weekStart, days), [month, today, weekStart, days]);
  const summary = useMemo(() => summarize(days, profile), [days, profile]);
  const hoveredCell = cells.find((cell): cell is Extract<CalendarCell, { type: "day" }> => cell.type === "day" && cell.key === hovered) ?? null;

  return (
    <>
      <div className="dt-stats">
        {statCards(summary, profile).map((card) => (
          <div key={card.key} className={`dt-stat dt-stat--${card.tone}`}>
            <span className="dt-stat-val">{card.value}</span>
            <div className="dt-stat-text">
              <span className="dt-stat-name">{card.name}</span>
              <span className="dt-stat-hint">{card.hint}</span>
            </div>
          </div>
        ))}
      </div>

      <section className="surface dt-cal" aria-label={`How closely you followed your targets in ${title}`}>
        <div className="dt-cal-top">
          <button type="button" className="btn btn-ghost btn-icon border-0" onClick={() => onChangeMonth(shiftMonth(month, -1))} aria-label="Previous month">
            <ChevronLeft size={16} />
          </button>
          <h2 className="dt-cal-title">{title}</h2>
          <button type="button" className="btn btn-ghost btn-icon border-0" onClick={() => onChangeMonth(shiftMonth(month, 1))} disabled={!canGoNext} aria-label="Next month">
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="dt-cal-dow-row">
          {weekDayLabels(weekStart).map((label) => (
            <span key={label} className="dt-cal-dow">{label}</span>
          ))}
        </div>

        {status === "loading" ? (
          <div className="dt-cal-loading" aria-hidden="true">
            <DietSkeleton height={260} />
          </div>
        ) : (
          <div className="dt-cal-grid" onMouseLeave={() => setHovered(null)}>
            {cells.map((cell) => {
              if (cell.type === "filler") return <div key={cell.key} className="dt-cal-filler" />;
              const score = cell.data?.score ?? null;
              const classes = ["dt-cal-day", `dt-cal-day--${cell.tier}`, cell.isToday && "is-today", cell.isFuture && "is-future", cell.data && "is-open", hovered === cell.key && "is-active"]
                .filter(Boolean)
                .join(" ");
              const enter = () => !cell.isFuture && setHovered(cell.key);

              if (!cell.data || score === null) {
                return (
                  <div key={cell.key} className={classes} onMouseEnter={enter}>
                    <span className="dt-cal-day-num">{cell.day}</span>
                  </div>
                );
              }
              return (
                <button
                  key={cell.key}
                  type="button"
                  className={classes}
                  onMouseEnter={enter}
                  onFocus={enter}
                  onClick={() => onOpenDay(cell.key)}
                  aria-haspopup="dialog"
                  aria-label={`${formatDisplayDate(cell.key)}: score ${score}%, ${fmt(cell.data.totals.calories)} kcal, protein ${fmt(cell.data.totals.protein_g)} g, carbs ${fmt(cell.data.totals.carbs_g)} g, fat ${fmt(cell.data.totals.fat_g)} g. Open this day.`}
                >
                  <span className="dt-cal-day-head">
                    <span className="dt-cal-day-num">{cell.day}</span>
                    <span className="dt-cal-kcal" aria-hidden="true">{fmt(cell.data.totals.calories)} kcal</span>
                  </span>
                  <span className="dt-cal-day-foot">
                    <span className="dt-cal-macros" aria-hidden="true">
                      <span><b>P</b> {fmt(cell.data.totals.protein_g)}</span>
                      <span><b>C</b> {fmt(cell.data.totals.carbs_g)}</span>
                      <span><b>F</b> {fmt(cell.data.totals.fat_g)}</span>
                    </span>
                    <svg viewBox="0 0 40 40" className="dt-cal-ring" aria-hidden="true">
                      <g transform="rotate(-90 20 20)">
                        <circle className="dt-cal-ring-track" cx="20" cy="20" r={RING_RADIUS} />
                        <circle className="dt-cal-ring-fill" cx="20" cy="20" r={RING_RADIUS} strokeDasharray={RING_CIRCUMFERENCE} strokeDashoffset={RING_CIRCUMFERENCE * (1 - score / 100)} />
                      </g>
                      <text className="dt-cal-ring-label" x="20" y="20">{score}%</text>
                    </svg>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <div className="dt-cal-preview" aria-live="polite">
          {status === "error" ? (
            <span className="dt-cal-preview-error">
              <ExclamationCircleFill size={12} /> Couldn't load this month{" "}
              <button type="button" className="btn btn-link btn-sm p-0 align-baseline" onClick={() => setReloadKey((k) => k + 1)}>Retry</button>
            </span>
          ) : !hoveredCell ? (
            <span className="dt-cal-preview-idle">
              {status === "ready" && summary.loggedDays === 0 ? `No food was logged in ${title}.` : "Hover over a day to preview, click it to open"}
            </span>
          ) : (
            <>
              <span className="dt-cal-preview-date">{formatDisplayDate(hoveredCell.key)}</span>
              <span className="dt-cal-preview-sep" />
              {hoveredCell.data ? (
                <>
                  <span className={`dt-cal-preview-score dt-cal-preview-score--${tierOf(hoveredCell.data.score)}`}>{hoveredCell.data.score}% score</span>
                  <span className="dt-cal-preview-sep" />
                  <span className="dt-cal-preview-detail">{fmt(hoveredCell.data.totals.calories)} / {fmt(profile.calorie_target)} kcal</span>
                  <span className="dt-cal-preview-sep" />
                  <span className="dt-cal-preview-detail">Protein {fmt(hoveredCell.data.totals.protein_g)} / {fmt(profile.protein_target_g)} g</span>
                  <span className="dt-cal-preview-sep" />
                  <span className="dt-cal-preview-detail">Carbs {fmt(hoveredCell.data.totals.carbs_g)} / {fmt(profile.carbs_target_g)} g</span>
                  <span className="dt-cal-preview-sep" />
                  <span className="dt-cal-preview-detail">Fat {fmt(hoveredCell.data.totals.fat_g)} / {fmt(profile.fat_target_g)} g</span>
                  <span className="dt-cal-preview-sep" />
                  <span className="dt-cal-preview-detail">Fibre {fmt(hoveredCell.data.totals.fibre_g)} / {fmt(profile.fibre_target_g)} g</span>
                  <span className="dt-cal-preview-sep" />
                  <span className="dt-cal-preview-detail">Water {fmt(hoveredCell.data.water_ml)} / {fmt(profile.water_target_ml)} ml</span>
                </>
              ) : (
                <span className="dt-cal-preview-detail">Nothing logged</span>
              )}
            </>
          )}
        </div>
      </section>
    </>
  );
}
