import { http } from "./client";
import type {
  PlannedTask,
  PlannedTaskCreate,
  PlannedTaskUpdate,
} from "./types";

export const planApi = {
  async list(onDate?: string): Promise<PlannedTask[]> {
    return http.get<PlannedTask[]>("/plan", onDate ? { on_date: onDate } : undefined);
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
