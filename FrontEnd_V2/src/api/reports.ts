import { MonthlyReportResponse } from "@/api/types";
import { http } from "@/api/client";

export const reportsApi = {
  async getMonthly(year: number, month: number): Promise<MonthlyReportResponse> {
    return http.get<MonthlyReportResponse>("/reports/monthly", {
      params: { year, month },
    });
  },
};
