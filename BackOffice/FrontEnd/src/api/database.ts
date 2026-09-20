import { http, httpBlob } from "./client";
import { ENDPOINTS } from "@/constant/bo-endpoints";
import type { BackupInfo, DeleteBackupResponse, RestoreBackupResponse, Row, RowsResponse, SqlQueryResponse, TableInfo } from "./types";

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
  async runQuery(query: string, page = 1, pageSize = 15): Promise<SqlQueryResponse> {
    return http.post<SqlQueryResponse>(ENDPOINTS.DATABASE.QUERY, { query, page, page_size: pageSize });
  },
  async listBackups(): Promise<BackupInfo[]> {
    return http.get<BackupInfo[]>(ENDPOINTS.DATABASE.BACKUPS);
  },
  async createBackup(): Promise<BackupInfo> {
    return http.post<BackupInfo>(ENDPOINTS.DATABASE.BACKUPS);
  },
  async downloadBackup(filename: string): Promise<Blob> {
    return httpBlob(ENDPOINTS.DATABASE.backupFile(filename));
  },
  async restoreBackup(filename: string): Promise<RestoreBackupResponse> {
    return http.post<RestoreBackupResponse>(ENDPOINTS.DATABASE.backupRestore(filename));
  },
  async deleteBackup(filename: string): Promise<DeleteBackupResponse> {
    return http.delete<DeleteBackupResponse>(ENDPOINTS.DATABASE.backupFile(filename));
  },
  async listBackupTables(filename: string): Promise<TableInfo[]> {
    return http.get<TableInfo[]>(ENDPOINTS.DATABASE.backupTables(filename));
  },
  async getBackupRows(filename: string, tableName: string, page: number, pageSize: number, search: string): Promise<RowsResponse> {
    return http.get<RowsResponse>(ENDPOINTS.DATABASE.backupRows(filename, tableName), {
      params: { page, page_size: pageSize, search },
    });
  },
  async getBackupRow(filename: string, tableName: string, pk: Row): Promise<Row | null> {
    const res = await http.get<{ row: Row | null }>(ENDPOINTS.DATABASE.backupRow(filename, tableName), {
      params: { pk: JSON.stringify(pk) },
    });
    return res.row;
  },
};
