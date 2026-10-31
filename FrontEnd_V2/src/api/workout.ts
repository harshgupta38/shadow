import { ENDPOINTS } from "@/constant/shadow-endpoints";
import { http } from "@/api/client";
import type {
  ExerciseDetail,
  ExerciseSummary,
  SessionSaveRequest,
  SessionStartRequest,
  WorkoutOverview,
  WorkoutPlanDetail,
  WorkoutPlanSaveRequest,
  WorkoutPlanSource,
  WorkoutPlanSummary,
  WorkoutProgress,
  WorkoutSessionDetail,
  WorkoutSessionSummary,
} from "@/api/types";

const W = ENDPOINTS.WORKOUT;
const url = (path: string) => `${W.PREFIX}${path}`;

export const workoutApi = {
  // ── Overview ────────────────────────────────────────────────────────────────
  getOverview(): Promise<WorkoutOverview> {
    return http.get<WorkoutOverview>(url(W.OVERVIEW));
  },

  getProgress(weeks = 8): Promise<WorkoutProgress> {
    return http.get<WorkoutProgress>(url(W.PROGRESS), { params: { weeks } });
  },

  // ── Exercise library ────────────────────────────────────────────────────────
  getExercises(): Promise<ExerciseSummary[]> {
    return http.get<ExerciseSummary[]>(url(W.EXERCISES));
  },

  getExercise(id: number): Promise<ExerciseDetail> {
    return http.get<ExerciseDetail>(url(W.EXERCISE(id)));
  },

  // ── Plans ───────────────────────────────────────────────────────────────────
  getPlans(source?: WorkoutPlanSource): Promise<WorkoutPlanSummary[]> {
    return http.get<WorkoutPlanSummary[]>(url(W.PLANS), { params: source ? { source } : undefined });
  },

  getPlan(id: number): Promise<WorkoutPlanDetail> {
    return http.get<WorkoutPlanDetail>(url(W.PLAN(id)));
  },

  getPlanDayWarmUps(planId: number, weekday: number): Promise<ExerciseSummary[]> {
    return http.get<ExerciseSummary[]>(url(W.PLAN_DAY_WARM_UPS(planId, weekday)));
  },

  createPlan(data: WorkoutPlanSaveRequest): Promise<WorkoutPlanDetail> {
    return http.post<WorkoutPlanDetail>(url(W.PLANS), data);
  },

  updatePlan(id: number, data: WorkoutPlanSaveRequest): Promise<WorkoutPlanDetail> {
    return http.put<WorkoutPlanDetail>(url(W.PLAN(id)), data);
  },

  deletePlan(id: number): Promise<void> {
    return http.delete<void>(url(W.PLAN(id)));
  },

  /** Copies any plan (usually a predefined one) into the user's own plans so it can be edited. */
  duplicatePlan(id: number): Promise<WorkoutPlanDetail> {
    return http.post<WorkoutPlanDetail>(url(W.PLAN_DUPLICATE(id)));
  },

  activatePlan(id: number): Promise<WorkoutPlanSummary> {
    return http.post<WorkoutPlanSummary>(url(W.PLAN_ACTIVATE(id)));
  },

  deactivatePlan(): Promise<void> {
    return http.post<void>(url(W.PLAN_DEACTIVATE));
  },

  // ── Sessions ────────────────────────────────────────────────────────────────
  startSession(data: SessionStartRequest): Promise<WorkoutSessionDetail> {
    return http.post<WorkoutSessionDetail>(url(W.SESSIONS), data);
  },

  getSession(id: number): Promise<WorkoutSessionDetail> {
    return http.get<WorkoutSessionDetail>(url(W.SESSION(id)));
  },

  /** Autosave while a workout is in progress. */
  saveSession(id: number, data: SessionSaveRequest): Promise<WorkoutSessionDetail> {
    return http.patch<WorkoutSessionDetail>(url(W.SESSION(id)), data);
  },

  finishSession(id: number, data: SessionSaveRequest): Promise<WorkoutSessionDetail> {
    return http.post<WorkoutSessionDetail>(url(W.SESSION_FINISH(id)), data);
  },

  deleteSession(id: number): Promise<void> {
    return http.delete<void>(url(W.SESSION(id)));
  },

  /** Completed sessions, newest first. */
  getSessions(limit: number, offset: number): Promise<WorkoutSessionSummary[]> {
    return http.get<WorkoutSessionSummary[]>(url(W.SESSIONS), { params: { limit, offset } });
  },
};
