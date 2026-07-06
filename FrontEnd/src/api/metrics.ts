import { http } from "./client";
import type {
  ActivityLog,
  ActivityLogCreate,
  MetricCreate,
  ProgressCoachRecommendation,
  ProgressCoachRecommendationAcceptResponse,
  MetricUpdate,
  TrackedMetric,
} from "./types";

export const metricsApi = {
  async list(includeInactive = false): Promise<TrackedMetric[]> {
    return http.get<TrackedMetric[]>(
      "/metrics",
      includeInactive ? { include_inactive: true } : undefined,
    );
  },
  async create(data: MetricCreate): Promise<TrackedMetric> {
    return http.post<TrackedMetric>("/metrics", data);
  },
  async update(id: number, data: MetricUpdate): Promise<TrackedMetric> {
    return http.put<TrackedMetric>(`/metrics/${id}`, data);
  },
  async remove(id: number): Promise<void> {
    return http.del(`/metrics/${id}`);
  },
  async logs(metricId: number): Promise<ActivityLog[]> {
    return http.get<ActivityLog[]>(`/metrics/${metricId}/logs`);
  },
  async addLog(metricId: number, data: ActivityLogCreate): Promise<ActivityLog> {
    return http.post<ActivityLog>(`/metrics/${metricId}/logs`, data);
  },
  async progressCoachRecommendations(): Promise<ProgressCoachRecommendation[]> {
    return http.get<ProgressCoachRecommendation[]>("/metrics/progress-coach-recommendations");
  },
  async acceptProgressCoachRecommendation(
    recommendationId: number,
  ): Promise<ProgressCoachRecommendationAcceptResponse> {
    return http.post<ProgressCoachRecommendationAcceptResponse>(
      `/metrics/progress-coach-recommendations/${recommendationId}/accept`,
    );
  },
};
