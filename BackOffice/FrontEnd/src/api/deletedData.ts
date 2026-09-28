import { http } from "./client";
import { ENDPOINTS } from "@/constant/bo-endpoints";
import type { Row, RowsResponse, TableInfo } from "./types";

// Read-only browsing of deleted_data.db — the archive "Delete User" writes
// to on Shadow V2's side. Not app-scoped like databaseApi: there's only one
// of these, owned by BackOffice itself, regardless of which app's Database
// page tab it's opened from.
export const deletedDataApi = {
  async listTables(): Promise<TableInfo[]> {
    return http.get<TableInfo[]>(ENDPOINTS.DELETED_DATA.tables());
  },
  async getRows(tableName: string, page: number, pageSize: number, search: string): Promise<RowsResponse> {
    return http.get<RowsResponse>(ENDPOINTS.DELETED_DATA.rows(tableName), {
      params: { page, page_size: pageSize, search },
    });
  },
  async getRow(tableName: string, pk: Row): Promise<Row | null> {
    const res = await http.get<{ row: Row | null }>(ENDPOINTS.DELETED_DATA.row(tableName), {
      params: { pk: JSON.stringify(pk) },
    });
    return res.row;
  },
};
