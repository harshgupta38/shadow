import { MonthlyReportResponse } from "@/api/types";
import { http } from "@/api/client";
import { ENDPOINTS } from "@/constant/shadow-endpoints";

const BASE = ENDPOINTS.REPORTS.PREFIX;

export const reportsApi = {
  async getMonthly(year: number, month: number): Promise<MonthlyReportResponse> {
    return http.get<MonthlyReportResponse>(`${BASE}${ENDPOINTS.REPORTS.MONTHLY}`, {
      params: { year, month },
    });
  },

  async generateReportRequest(reportDate: string, reportType: "daily" | "weekly"): Promise<void> {
    await http.post<void>(
      `${BASE}${ENDPOINTS.REPORTS.GENERATE_REPORT_REQUEST(reportDate)}?report_type=${reportType}`,
    );
  },
};
