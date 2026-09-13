import { DailyReportDetail, MonthlyReportResponse } from "@/api/types";
import { http } from "@/api/client";
import { ENDPOINTS } from "@/constant/shadow-endpoints";

const BASE = ENDPOINTS.REPORTS.PREFIX;

export const reportsApi = {
  async getMonthly(year: number, month: number): Promise<MonthlyReportResponse> {
    return http.get<MonthlyReportResponse>(`${BASE}${ENDPOINTS.REPORTS.MONTHLY}`, {
      params: { year, month },
    });
  },

  async getReports(reportDate: string): Promise<DailyReportDetail[]> {
    return http.get<DailyReportDetail[]>(`${BASE}${ENDPOINTS.REPORTS.REPORT_DETAIL(reportDate)}`);
  },

  async generateReportRequest(reportDate: string, reportType: "daily" | "weekly"): Promise<void> {
    await http.post<void>(`${BASE}${ENDPOINTS.REPORTS.GENERATE_REPORT_REQUEST(reportDate)}`, undefined, {
      params: { report_type: reportType },
    });
  },
};
