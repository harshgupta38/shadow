import { http } from "./client";
import type { Report, ReportGenerateRequest, ReportPeriod } from "./types";

export const reportsApi = {
  async list(period?: ReportPeriod): Promise<Report[]> {
    return http.get<Report[]>("/reports", period ? { period } : undefined);
  },
  async generate(data: ReportGenerateRequest): Promise<Report> {
    return http.post<Report>("/reports/generate", data);
  },
  async get(id: number): Promise<Report> {
    return http.get<Report>(`/reports/${id}`);
  },
};
