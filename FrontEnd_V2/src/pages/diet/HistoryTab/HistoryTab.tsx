import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ExclamationCircleFill } from "react-bootstrap-icons";

import { api } from "@/api";
import type { DiaryHistoryDay, DietProfile } from "@/api";
import { useTimeFormat } from "@/context/PlannerContext";
import { DietSkeleton } from "@/pages/diet/DietSkeleton/DietSkeleton";
import { mealLabel, toTimeInput } from "@/pages/diet/DietPage.constants";
import { HistoryDayDialog } from "@/pages/diet/HistoryTab/HistoryDayDialog/HistoryDayDialog";
import { columnsFor, columnsTemplate, foodsLine, foodsTitle, mealsInColumn, monthDates } from "@/pages/diet/HistoryTab/HistoryTab.constants";
import { dayParts, fmtMonthTitle, formatDisplayDate, formatTime, monthOf, shiftMonth, todayIso } from "@/services/date.service";
import "./HistoryTab.scss";

type Status = "loading" | "ready" | "error";

interface HistoryTabProps {
  profile: DietProfile;
}

/** The month at a glance: what was eaten on each day, in which meal and when. Opening a day shows its nutrition. */
export function HistoryTab({ profile }: HistoryTabProps) {
  const timeFormat = useTimeFormat();
  const today = todayIso();
  const [month, setMonth] = useState(monthOf(today));
  const [days, setDays] = useState<DiaryHistoryDay[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [reloadKey, setReloadKey] = useState(0);
  const [openDate, setOpenDate] = useState<string | null>(null);

  const title = fmtMonthTitle(month);
  const canGoNext = month < monthOf(today);

  useEffect(() => {
    let active = true; // only the newest month may fill the screen, so quick month changes can't show one month under another's title
    setStatus("loading");
    setDays([]);
    void api.diet
      .getHistory(month)
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

  const byDate = useMemo(() => new Map(days.map((day) => [day.date, day])), [days]);
  const columns = useMemo(() => columnsFor(days), [days]);
  const dates = useMemo(() => monthDates(month, today), [month, today]);

  return (
    <section className="surface dt-hist" aria-label={`What you ate in ${title}`}>
      <div className="dt-hist-top">
        <h2 className="dt-hist-title">{title}</h2>
        <div className="dt-hist-nav">
          <button type="button" className="btn btn-ghost btn-icon border-0" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month">
            <ChevronLeft size={15} />
          </button>
          <button type="button" className="btn btn-ghost btn-icon border-0" onClick={() => setMonth(shiftMonth(month, 1))} disabled={!canGoNext} aria-label="Next month">
            <ChevronRight size={15} />
          </button>
        </div>
      </div>

      {status === "loading" && (
        <div className="dt-hist-loading" aria-hidden="true">
          <DietSkeleton height={52} />
          <DietSkeleton height={52} />
          <DietSkeleton height={52} />
        </div>
      )}

      {status === "error" && (
        <p className="dt-hist-note dt-hist-note--error">
          <ExclamationCircleFill size={12} /> Couldn't load this month{" "}
          <button type="button" className="btn btn-link btn-sm p-0 align-baseline" onClick={() => setReloadKey((k) => k + 1)}>
            Retry
          </button>
        </p>
      )}

      {status === "ready" && days.length === 0 && <p className="dt-hist-note">No food was logged in {title}.</p>}

      {status === "ready" && days.length > 0 && (
        <div className="dt-hist-table" style={{ "--dt-hist-template": columnsTemplate(columns) } as React.CSSProperties}>
          <div className="dt-hist-head" aria-hidden="true">
            <span />
            {columns.map((column) => (
              <span key={column.key} className="dt-hist-col">
                <column.icon size={12} /> {column.label}
              </span>
            ))}
          </div>

          <ol className="dt-hist-list">
            {dates.map((date) => {
              const day = byDate.get(date);
              const { day: dayNumber, weekday } = dayParts(date);
              const dateLabel = (
                <span className="dt-hist-date">
                  <span className="dt-hist-day">{dayNumber}</span>
                  <span className="dt-hist-dow">{weekday}</span>
                  <span className="visually-hidden">{formatDisplayDate(date)}</span>
                </span>
              );

              if (!day) {
                return (
                  <li key={date}>
                    <div className={`dt-hist-row is-empty${date === today ? " is-today" : ""}`}>
                      {dateLabel}
                      <span className="dt-hist-none">Nothing logged</span>
                    </div>
                  </li>
                );
              }

              return (
                <li key={date}>
                  <button
                    type="button"
                    className={`dt-hist-row${date === today ? " is-today" : ""}`}
                    onClick={() => setOpenDate(date)}
                    aria-haspopup="dialog"
                  >
                    {dateLabel}
                    {columns.map((column) => {
                      const meals = mealsInColumn(day, column);
                      return (
                        <span key={column.key} className={`dt-hist-cell${meals.length === 0 ? " is-empty" : ""}`} data-label={column.label}>
                          {meals.length === 0 && <span className="dt-hist-dash" aria-hidden="true">–</span>}
                          {meals.map((meal) => (
                            <span key={`${meal.meal_type}-${meal.eaten_at ?? ""}`} className="dt-hist-meal" title={foodsTitle(meal)}>
                              {meal.eaten_at && <span className="dt-hist-time">{formatTime(toTimeInput(meal.eaten_at), timeFormat)}</span>}
                              <span className="dt-hist-foods">
                                {column.key === "other" && <strong>{mealLabel(meal.meal_type)}: </strong>}
                                {foodsLine(meal)}
                              </span>
                            </span>
                          ))}
                        </span>
                      );
                    })}
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      <HistoryDayDialog date={openDate} profile={profile} onClose={() => setOpenDate(null)} />
    </section>
  );
}
