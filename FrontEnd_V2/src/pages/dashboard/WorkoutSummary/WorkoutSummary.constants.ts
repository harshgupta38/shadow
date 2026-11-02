import type { MuscleId, MuscleSets, WorkoutOverview, WorkoutWeekDay } from "@/api";
import { ROUTES } from "@/routes/RoutePaths";

/** Whether the dashboard has anything to say about training: a plan being followed, or a workout this week (one under way counts). */
export function hasTrainingToShow(overview: WorkoutOverview): boolean {
  return overview.active_plan !== null || overview.sessions_this_week > 0 || overview.in_progress_session_id !== null;
}

/** The page of one workout, finished or under way. */
export function sessionPath(sessionId: number): string {
  return ROUTES.WORKOUT_SESSION.replace(":sessionId", String(sessionId));
}

/** Kilograms lifted as the number a person would say: 8,400 kg is "8.4 t". */
export function volumeLabel(kg: number): string {
  if (kg >= 1000) return `${(kg / 1000).toLocaleString("en-IN", { maximumFractionDigits: 1 })} t`;
  return `${Math.round(kg).toLocaleString("en-IN")} kg`;
}

export interface MuscleFocus {
  /** The most worked muscles, lit as "primary" on the body diagram. */
  primary: MuscleId[];
  /** Everything else that was worked at all. */
  secondary: MuscleId[];
  /** The top five with their sets, for the list in today's card. */
  top: (MuscleSets & { percent: number })[];
}

/** Splits the week's sets into what to light up strongly and what to light up softly on the diagram, and picks the top few for the list. */
export function muscleFocus(muscles: MuscleSets[]): MuscleFocus {
  const worked = muscles.filter((entry) => entry.sets > 0).sort((a, b) => b.sets - a.sets);
  const most = worked[0]?.sets ?? 0;
  return {
    primary: worked.filter((entry) => entry.sets >= most / 2).map((entry) => entry.muscle),
    secondary: worked.filter((entry) => entry.sets < most / 2).map((entry) => entry.muscle),
    top: worked.slice(0, 5).map((entry) => ({ ...entry, percent: most ? (entry.sets / most) * 100 : 0 })),
  };
}

/** Where a day of the week leads: a finished day opens its workout, today starts or resumes it, and a day still to come (or missed) opens that day of the plan. A rest day leads nowhere. */
export function dayLink(day: WorkoutWeekDay, overview: WorkoutOverview): string | null {
  const plan = overview.active_plan;
  if (day.status === "done" && day.session_id !== null) return sessionPath(day.session_id);
  if (day.status === "today") {
    return overview.in_progress_session_id !== null ? sessionPath(overview.in_progress_session_id) : ROUTES.WORKOUT;
  }
  if ((day.status === "upcoming" || day.status === "missed") && plan) return `${ROUTES.WORKOUT_PLAN_DETAIL.replace(":planId", String(plan.id))}?day=${day.weekday}`;
  return null;
}
