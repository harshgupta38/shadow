import { Link } from "react-router-dom";
import { CalendarWeek, CheckCircleFill, MoonStarsFill, PlayFill } from "react-bootstrap-icons";

import type { WorkoutOverview } from "@/api";
import { ringColor } from "@/pages/dashboard/ReportsOverview/ReportsOverview.constants";
import {
  WEEKDAY_LONG,
  dayLink,
  muscleFocus,
  sessionPath,
  volumeLabel,
} from "@/pages/dashboard/WorkoutSummary/WorkoutSummary.constants";
import { MuscleChips, MuscleMap } from "@/pages/workout/MuscleMap/MuscleMap";
import { MUSCLE_LABEL, pluralize } from "@/pages/workout/WorkoutPage.constants";
import { ROUTES } from "@/routes/RoutePaths";
import { formatDuration } from "@/services/date.service";
import { weekDayLabels, weekRangeStr } from "@/utils/weekUtils";
// The stat cards, the card-and-report layout and the highlight boxes are the ones the Today's Snapshot and Reports Overview panels use.
import "@/pages/dashboard/TodaySnapshot/TodaySnapshot.scss";
import "@/pages/dashboard/ReportsOverview/ReportsOverview.scss";
import "./WorkoutSummary.scss";

interface WorkoutSummaryProps {
  overview: WorkoutOverview;
}

/** The same ring as the report's, filled by how many of the week's sessions are done. */
function SessionsRing({ done, target }: { done: number; target: number }) {
  const size = 96;
  const stroke = 9;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const percent = target > 0 ? Math.min(100, Math.round((done / target) * 100)) : 0;
  const color = ringColor(percent);

  return (
    <div className="dp-report-ring-wrap" style={{ width: size, height: size }} role="img" aria-label={`${done} of ${target} sessions done this week`}>
      <svg width={size} height={size} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="color-mix(in srgb, var(--jv-border) 88%, transparent)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={circumference * (1 - percent / 100)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="dp-report-ring-label">
        <span className="dp-report-ring-pct" style={{ color }}>{done}/{target}</span>
        <span className="dp-report-ring-sub">Sessions</span>
      </div>
    </div>
  );
}

/** The week of training at a glance: today's session, the week so far, and which muscles it has reached. */
export function WorkoutSummary({ overview }: WorkoutSummaryProps) {
  const plan = overview.active_plan;
  const focus = muscleFocus(overview.muscles_this_week);
  const nextSession = overview.week.find((day) => day.status === "upcoming" && day.label);
  const dayExercises = overview.today_plan_day?.exercises ?? [];
  const dayMuscles = [...new Set(dayExercises.flatMap((entry) => entry.exercise.primary_muscles))];
  const todayDate = new Date(`${overview.today_date}T00:00:00`); // the server's day, the same one the week is built from
  const dayLabels = weekDayLabels("sunday"); // the overview's week always runs Sunday to Saturday

  // Nobody has trained or picked a plan yet: one invitation, not a week of empty cards.
  if (!plan && overview.total_sessions === 0) {
    return (
      <div className="dp-section dp-wk">
        <div className="dp-section-head">
          <h2 className="dp-section-title">Training</h2>
          <Link to={ROUTES.WORKOUT} className="dp-section-link">Open workout →</Link>
        </div>
        <div className="dp-report-hero">
          <span className="dp-wk-newcomer-icon" aria-hidden="true">🏋️</span>
          <div className="dp-report-body">
            <span className="dp-report-date">Training</span>
            <h3 className="dp-report-headline">Start training with a plan</h3>
            <p className="dp-report-summary">Pick a ready-made plan or build your own, and your week fills itself in here.</p>
            <Link to={`${ROUTES.WORKOUT}?tab=plans`} className="dp-report-cta">Choose a plan →</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dp-section dp-wk">
      <div className="dp-section-head">
        <h2 className="dp-section-title">Training</h2>
        {plan && <span className="dp-section-chip">{plan.name}</span>}
        <Link to={ROUTES.WORKOUT} className="dp-section-link">Open workout →</Link>
      </div>

      <div className="dp-reports-grid">
        {/* ── Muscles reached: the narrow card, like the calendar beside the report ── */}
        <div className="dp-cal-card dp-wk-muscles">
          <div className="dp-cal-head">Muscles this week</div>
          <div className="dp-wk-map">
            <MuscleMap primary={focus.primary} secondary={focus.secondary} view="both" size="md" />
          </div>
          {focus.top.length === 0 && <p className="dp-wk-quiet">Nothing logged yet this week.</p>}
        </div>

        <div className="dp-report-col">
          {/* ── Today ──────────────────────────────────────────────── */}
          <div className="dp-report-hero">
            <SessionsRing done={overview.sessions_this_week} target={overview.sessions_target} />
            <div className="dp-report-body">
              <span className="dp-report-date">Today · {WEEKDAY_LONG[todayDate.getDay()]}</span>

              {!plan && (
                <>
                  <h3 className="dp-report-headline">No plan yet</h3>
                  <p className="dp-report-summary">Pick a plan and your week fills itself in.</p>
                  <Link to={`${ROUTES.WORKOUT}?tab=plans`} className="dp-report-cta">Choose a plan →</Link>
                </>
              )}

              {plan && overview.in_progress_session_id !== null && (
                <>
                  <h3 className="dp-report-headline">{overview.today_plan_day?.name ?? "Workout"} is under way</h3>
                  <p className="dp-report-summary">Pick up where you left off.</p>
                  <Link to={sessionPath(overview.in_progress_session_id)} className="dp-report-cta">
                    <PlayFill size={13} /> Resume workout →
                  </Link>
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
                  </p>
                  <MuscleChips primary={dayMuscles} max={4} />
                  <Link to={ROUTES.WORKOUT} className="dp-report-cta">
                    <PlayFill size={13} /> Start workout →
                  </Link>
                </>
              )}
            </div>

            {focus.top.length > 0 && (
              <div className="dp-wk-hero-muscles">
                <span className="dp-wk-hero-muscles-title">Most worked this week</span>
                <ul className="dp-wk-top">
                  {focus.top.map((entry) => (
                    <li key={entry.muscle}>
                      <span className="dp-wk-top-name">{MUSCLE_LABEL[entry.muscle]}</span>
                      <span className="dp-wk-top-track" aria-hidden="true"><span style={{ width: `${entry.percent}%` }} /></span>
                      <span className="dp-wk-top-sets">{pluralize(entry.sets, "set")}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* ── The week so far ─────────────────────────────────────── */}
          <div className="dp-panel dp-wk-week">
            <div className="dp-panel-head">
              <CalendarWeek size={15} className="text-muted-2" />
              <h3 className="dp-panel-title">This Week</h3>
              <span className="dp-section-chip">{weekRangeStr(todayDate, "sunday")}</span>
              <span className="dp-wk-streak">
                🔥 <strong>{pluralize(overview.streak_weeks, "week")}</strong> in a row · {pluralize(overview.total_sessions, "workout")} logged
              </span>
            </div>
            <ol className="dp-wk-days">
              {overview.week.map((cell) => {
                const to = dayLink(cell, overview);
                const classes = `dp-wk-day dp-wk-day--${cell.status}${to ? " is-link" : ""}`;
                const content = (
                  <>
                    <span className="dp-wk-day-name">
                      {cell.status === "done" && <CheckCircleFill size={10} className="dp-wk-day-check" aria-hidden="true" />}
                      {dayLabels[cell.weekday]}
                      {!!cell.minutes && <span className="dp-wk-day-mins"> · {cell.minutes}m</span>}
                    </span>
                    <span className="dp-wk-day-label">{cell.label ?? "Rest"}</span>
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
