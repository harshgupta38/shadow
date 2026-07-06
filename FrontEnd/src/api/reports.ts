import { http } from "./client";
import type {
  Report,
  ReportAutomation,
  ReportAutomationUpdate,
  ReportGenerateRequest,
  ReportHistoryCard,
  ReportPeriod,
} from "./types";

export const reportsApi = {
  async list(period?: ReportPeriod): Promise<Report[]> {
    return http.get<Report[]>("/reports", period ? { period } : undefined);
  },
  async history(period?: ReportPeriod): Promise<ReportHistoryCard[]> {
    return http.get<ReportHistoryCard[]>("/reports/history", period ? { period } : undefined);
  },
  async versions(historyDate: string, period?: ReportPeriod): Promise<Report[]> {
    return http.get<Report[]>(`/reports/history/${historyDate}`, period ? { period } : undefined);
  },
  async generate(data: ReportGenerateRequest): Promise<Report> {
    return http.post<Report>("/reports/generate", data);
  },
  async get(id: number): Promise<Report> {
    return http.get<Report>(`/reports/${id}`);
  },
  async remove(id: number): Promise<void> {
    return http.del(`/reports/${id}`);
  },
  async getAutomation(): Promise<ReportAutomation> {
    return http.get<ReportAutomation>("/reports/automation");
  },
  async updateAutomation(data: ReportAutomationUpdate): Promise<ReportAutomation> {
    return http.put<ReportAutomation>("/reports/automation", data);
  },
};
