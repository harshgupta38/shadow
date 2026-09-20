import { http } from "./client";
import { ENDPOINTS } from "@/constant/bo-endpoints";
import type { Row, RowsResponse, SqlQueryResponse, TableInfo } from "./types";

export const databaseApi = {
  async listTables(): Promise<TableInfo[]> {
    return http.get<TableInfo[]>(ENDPOINTS.DATABASE.TABLES);
  },
  async getRows(tableName: string, page: number, pageSize: number, search: string): Promise<RowsResponse> {
    return http.get<RowsResponse>(ENDPOINTS.DATABASE.rows(tableName), {
      params: { page, page_size: pageSize, search },
    });
  },
  async getRow(tableName: string, pk: Row): Promise<Row | null> {
    const res = await http.get<{ row: Row | null }>(ENDPOINTS.DATABASE.row(tableName), {
      params: { pk: JSON.stringify(pk) },
    });
    return res.row;
  },
  async insertRow(tableName: string, data: Row): Promise<unknown> {
    return http.post(ENDPOINTS.DATABASE.rows(tableName), { data });
  },
  async updateRow(tableName: string, pk: Row, data: Row): Promise<unknown> {
    return http.put(ENDPOINTS.DATABASE.rows(tableName), { pk, data });
  },
  async deleteRow(tableName: string, pk: Row): Promise<unknown> {
    return http.delete(ENDPOINTS.DATABASE.rows(tableName), { pk });
  },
  async runQuery(query: string): Promise<SqlQueryResponse> {
    return http.post<SqlQueryResponse>(ENDPOINTS.DATABASE.QUERY, { query });
  },
};
