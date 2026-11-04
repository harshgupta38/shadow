import { Link } from "react-router-dom";
import { CalendarWeek, CheckCircleFill, MoonStarsFill, PlayFill } from "react-bootstrap-icons";

import type { WorkoutOverview } from "@/api";
import { DashboardRing } from "@/pages/dashboard/DashboardRing/DashboardRing";
import {
  dayLink,
  muscleFocus,
  sessionPath,
  volumeLabel,
} from "@/pages/dashboard/WorkoutSummary/WorkoutSummary.constants";
import { MuscleChips, MuscleMap } from "@/pages/workout/MuscleMap/MuscleMap";
import { MUSCLE_LABEL, WEEKDAY_LONG, pluralize } from "@/pages/workout/WorkoutPage.constants";
import { ROUTES } from "@/routes/RoutePaths";
import { useDateFormat } from "@/context/PlannerContext";
import { dayHeading } from "@/pages/dashboard/DashboardPage.constants";
import { formatDuration, todayIso } from "@/services/date.service";
import { weekDayLabels, weekRangeStr } from "@/utils/weekUtils";
// The stat cards, the card-and-report layout and the highlight boxes are the ones the Today's Snapshot and Reports Overview panels use.
import "@/pages/dashboard/TodaySnapshot/TodaySnapshot.scss";
import "@/pages/dashboard/ReportsOverview/ReportsOverview.scss";
import "./WorkoutSummary.scss";

interface WorkoutSummaryProps {
  overview: WorkoutOverview;
  /** The panel as a record of a past day, as in a daily report: no calls to act on today. */
  snapshot?: boolean;
}

/** The week of training at a glance: today's session, the week so far, and which muscles it has reached. */
export function WorkoutSummary({ overview, snapshot = false }: WorkoutSummaryProps) {
  const dateFormat = useDateFormat();
  const plan = overview.active_plan;
  const focus = muscleFocus(overview.muscles_this_week);
  const nextSession = overview.week.find((day) => day.status === "upcoming" && day.label);
  const dayExercises = overview.today_plan_day?.exercises ?? [];
  const dayMuscles = [...new Set(dayExercises.flatMap((entry) => entry.exercise.primary_muscles))];
  const todayDate = new Date(`${overview.today_date}T00:00:00`); // the server's day, the same one the week is built from
  const dayLabels = weekDayLabels("sunday"); // the overview's week always runs Sunday to Saturday

  return (
    <div className="dp-section dp-wk-section">
      <div className="dp-section-head">
        <h2 className="dp-section-title">Training</h2>
        {plan && <span className="dp-section-chip">{plan.name}</span>}
        <Link to={ROUTES.WORKOUT} className="dp-section-link">Open workout →</Link>
      </div>

      <div className="dp-reports-grid dp-reports-grid--stretch dp-wk-grid">
        {/* ── Muscles reached: the narrow card, like the calendar beside the report ── */}
        <div className="dp-cal-card dp-wk-muscles">
          <div className="dp-cal-head">Muscles this week</div>
          <div className="dp-wk-map">
            <MuscleMap primary={focus.primary} secondary={focus.secondary} view="both" size="md" />
          </div>
          {focus.top.length === 0 && <p className="dp-quiet">Nothing logged yet this week.</p>}
        </div>

        <div className="dp-report-col">
          {/* ── Today ──────────────────────────────────────────────── */}
          <div className="dp-report-hero dp-report-hero--aside">
            <DashboardRing
              percent={overview.sessions_target > 0 ? (overview.sessions_this_week / overview.sessions_target) * 100 : 0}
              value={`${overview.sessions_this_week}/${overview.sessions_target}`}
              caption="Sessions"
              ariaLabel={`${overview.sessions_this_week} of ${overview.sessions_target} sessions done this week`}
            />
            <div className="dp-report-body">
              <span className="dp-report-date">{dayHeading(overview.today_date, dateFormat)}</span>

              {!plan && (
                <>
                  <h3 className="dp-report-headline">No plan yet</h3>
                  <p className="dp-report-summary">Pick a plan and your week fills itself in.</p>
                  {!snapshot && <Link to={`${ROUTES.WORKOUT}?tab=plans`} className="dp-report-cta">Choose a plan →</Link>}
                </>
              )}

              {plan && overview.in_progress_session_id !== null && (
                <>
                  <h3 className="dp-report-headline">{overview.today_plan_day?.name ?? "Workout"} is under way</h3>
                  <p className="dp-report-summary">Pick up where you left off.</p>
                  {!snapshot && (
                    <Link to={sessionPath(overview.in_progress_session_id)} className="dp-report-cta">
                      <PlayFill size={13} /> Resume workout →
                    </Link>
                  )}
                </>
              )}

              {plan && overview.in_progress_session_id === null && overview.completed_today && (
                <>
                  <h3 className="dp-report-headline"><CheckCircleFill size={18} className="dp-wk-done-icon" /> {overview.completed_today.name} done</h3>
                  <p className="dp-report-summary">
                    {formatDuration(Math.max(1, Math.round(overview.completed_today.duration_seconds / 60)))} · {pluralize(overview.completed_today.sets_done, "set")} ·{" "}
                    {volumeLabel(overview.completed_today.volume_kg)} lifted
                  </p>
                  <MuscleChips primary={overview.completed_today.muscles} max={4} />
                </>
              )}

              {plan && overview.in_progress_session_id === null && !overview.completed_today && overview.is_rest_day && (
                <>
                  <h3 className="dp-report-headline"><MoonStarsFill size={16} className="dp-wk-rest-icon" /> Rest day</h3>
                  <p className="dp-report-summary">
                    {nextSession ? `Next up: ${nextSession.label} on ${WEEKDAY_LONG[nextSession.weekday]}.` : "Recovery is part of the plan."}
                  </p>
                </>
              )}

              {plan && overview.in_progress_session_id === null && !overview.completed_today && !overview.is_rest_day && overview.today_plan_day && (
                <>
                  <h3 className="dp-report-headline">{overview.today_plan_day.name}</h3>
                  <p className="dp-report-summary">
                    {pluralize(dayExercises.length, "exercise")} · about {overview.today_plan_day.estimated_minutes} min
                    {snapshot && overview.today_date !== todayIso() && " · not logged"}
                  </p>
                  <MuscleChips primary={dayMuscles} max={4} />
                  {!snapshot && (
                    <Link to={ROUTES.WORKOUT} className="dp-report-cta">
                      <PlayFill size={13} /> Start workout →
                    </Link>
                  )}
                </>
              )}
            </div>

            {focus.top.length > 0 && (
              <div className="dp-hero-aside">
                <span className="dp-hero-aside-title">Most worked this week</span>
                <ul className="dp-rank">
                  {focus.top.map((entry) => (
                    <li key={entry.muscle}>
                      <span className="dp-rank-name">{MUSCLE_LABEL[entry.muscle]}</span>
                      <span className="dp-rank-track" aria-hidden="true"><span style={{ width: `${entry.percent}%` }} /></span>
                      <span className="dp-rank-value">{pluralize(entry.sets, "set")}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* ── The week so far ─────────────────────────────────────── */}
          <div className="dp-panel">
            <div className="dp-panel-head">
              <CalendarWeek size={15} className="text-muted-2" />
              <h3 className="dp-panel-title">This Week</h3>
              <span className="dp-section-chip">{weekRangeStr(todayDate, "sunday")}</span>
              <span className="dp-panel-note">
                🔥 <strong>{pluralize(overview.streak_weeks, "week")}</strong> in a row · {pluralize(overview.total_sessions, "workout")} logged
              </span>
            </div>
            <ol className="dp-days">
              {overview.week.map((cell) => {
                const to = dayLink(cell, overview);
                const classes = `dp-day dp-day--${cell.status}${to ? " is-link" : ""}`;
                const content = (
                  <>
                    <span className="dp-day-name">
                      {cell.status === "done" && <CheckCircleFill size={10} className="dp-day-check" aria-hidden="true" />}
                      {dayLabels[cell.weekday]}
                      {!!cell.minutes && <span className="dp-day-extra"> · {cell.minutes}m</span>}
                    </span>
                    <span className="dp-day-label">{cell.label ?? "Rest"}</span>
                  </>
                );
                return (
                  <li key={cell.date}>
                    {to ? (
                      <Link
                        to={to}
                        className={classes}
                        aria-label={`${WEEKDAY_LONG[cell.weekday]}: ${cell.label}, ${cell.status}${cell.minutes ? `, ${cell.minutes} minutes` : ""}. Open it.`}
                      >
                        {content}
                      </Link>
                    ) : (
                      <div className={classes}>{content}</div>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
