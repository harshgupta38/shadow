import { http, httpClient } from "./client";
import type {
  PlanGenerateRequest,
  PlanScheduleDraft,
  PlanScheduleDraftRequest,
  PlanWorkspace,
  PlannedTask,
  PlannedTaskCreate,
  PlannedTaskProgressUpdate,
  PlannedTaskUpdate,
} from "./types";

export const planApi = {
  async list(onDate?: string): Promise<PlannedTask[]> {
    return http.get<PlannedTask[]>("/plan", onDate ? { on_date: onDate } : undefined);
  },
  async workspace(
    onDate?: string,
    options: { bypassCache?: boolean } = {},
  ): Promise<PlanWorkspace> {
    return http.get<PlanWorkspace>(
      "/plan/workspace",
      onDate ? { on_date: onDate } : undefined,
      { bypassCache: options.bypassCache },
    );
  },
  async generateToday(data?: PlanGenerateRequest): Promise<PlanWorkspace> {
    const response = await httpClient.post<PlanWorkspace>(
      "/plan/generate-today",
      data ?? {},
      { timeout: 120_000 },
    );
    return response.data;
  },
  async create(data: PlannedTaskCreate): Promise<PlannedTask> {
    return http.post<PlannedTask>("/plan", data);
  },
  async scheduleList(fromDate?: string): Promise<PlannedTask[]> {
    return http.get<PlannedTask[]>("/plan/schedule", fromDate ? { from_date: fromDate } : undefined);
  },
  async draftScheduleTask(data: PlanScheduleDraftRequest): Promise<PlanScheduleDraft> {
    return http.post<PlanScheduleDraft>("/plan/schedule/draft", data);
  },
  async createScheduled(data: PlannedTaskCreate): Promise<PlannedTask> {
    return http.post<PlannedTask>("/plan/schedule", data);
  },
  async updateScheduled(id: number, data: PlannedTaskUpdate): Promise<PlannedTask> {
    return http.put<PlannedTask>(`/plan/schedule/${id}`, data);
  },
  async update(id: number, data: PlannedTaskUpdate): Promise<PlannedTask> {
    return http.put<PlannedTask>(`/plan/${id}`, data);
  },
  async logProgress(id: number, data: PlannedTaskProgressUpdate): Promise<PlanWorkspace> {
    return http.post<PlanWorkspace>(`/plan/${id}/progress`, data);
  },
  async remove(id: number): Promise<void> {
    return http.del(`/plan/${id}`);
  },
};
