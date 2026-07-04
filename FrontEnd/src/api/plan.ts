import { http, httpClient } from "./client";
import type {
  PlanGenerateRequest,
  PlanWorkspace,
  PlannedTask,
  PlannedTaskCreate,
  PlannedTaskUpdate,
} from "./types";

export const planApi = {
  async list(onDate?: string): Promise<PlannedTask[]> {
    return http.get<PlannedTask[]>("/plan", onDate ? { on_date: onDate } : undefined);
  },
  async workspace(onDate?: string): Promise<PlanWorkspace> {
    return http.get<PlanWorkspace>(
      "/plan/workspace",
      onDate ? { on_date: onDate } : undefined,
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
  async update(id: number, data: PlannedTaskUpdate): Promise<PlannedTask> {
    return http.put<PlannedTask>(`/plan/${id}`, data);
  },
  async remove(id: number): Promise<void> {
    return http.del(`/plan/${id}`);
  },
};
