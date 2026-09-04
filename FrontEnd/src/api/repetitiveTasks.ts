import { http } from "./client";
import type {
  RepetitiveTask,
  RepetitiveTaskCreate,
  RepetitiveTaskRecommendation,
  RepetitiveTaskStatus,
  RepetitiveTaskUpdate,
} from "./types";

export const repetitiveTasksApi = {
  async list(status?: RepetitiveTaskStatus): Promise<RepetitiveTask[]> {
    return http.get<RepetitiveTask[]>("/repetitive-tasks", status ? { status } : undefined);
  },
  async recommendations(limit?: number): Promise<RepetitiveTaskRecommendation[]> {
    return http.get<RepetitiveTaskRecommendation[]>(
      "/repetitive-tasks/recommendations",
      typeof limit === "number" ? { limit } : undefined,
    );
  },
  async create(data: RepetitiveTaskCreate): Promise<RepetitiveTask> {
    return http.post<RepetitiveTask>("/repetitive-tasks", data);
  },
  async update(id: number, data: RepetitiveTaskUpdate): Promise<RepetitiveTask> {
    return http.put<RepetitiveTask>(`/repetitive-tasks/${id}`, data);
  },
  async remove(id: number): Promise<void> {
    return http.del(`/repetitive-tasks/${id}`);
  },
};
