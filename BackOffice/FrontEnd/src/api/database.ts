import { http, httpBlob } from "./client";
import { ENDPOINTS } from "@/constant/bo-endpoints";
import type { AppTarget, BackupInfo, DeleteBackupResponse, RestoreBackupResponse, Row, RowsResponse, SqlHistoryEntry, SqlQueryResponse, SqlSplitResponse, TableInfo } from "./types";

export const databaseApi = {
  async listTables(app: AppTarget): Promise<TableInfo[]> {
    return http.get<TableInfo[]>(ENDPOINTS.DATABASE.tables(app));
  },
  async getRows(app: AppTarget, tableName: string, page: number, pageSize: number, search: string): Promise<RowsResponse> {
    return http.get<RowsResponse>(ENDPOINTS.DATABASE.rows(app, tableName), {
      params: { page, page_size: pageSize, search },
    });
  },
  async getRow(app: AppTarget, tableName: string, pk: Row): Promise<Row | null> {
    const res = await http.get<{ row: Row | null }>(ENDPOINTS.DATABASE.row(app, tableName), {
      params: { pk: JSON.stringify(pk) },
    });
    return res.row;
  },
  // Raw bytes of one BLOB cell (e.g. daily_brief_audio.audio_data) — never
  // included in getRows()/getRow() itself, which only ever see the
  // {size_bytes} placeholder the backend swaps in so listing a table with
  // a binary column doesn't fail to serialize.
  async getBlob(app: AppTarget, tableName: string, column: string, pk: Row): Promise<Blob> {
    return httpBlob(ENDPOINTS.DATABASE.blob(app, tableName), {
      params: { column, pk: JSON.stringify(pk) },
    });
  },
  async insertRow(app: AppTarget, tableName: string, data: Row): Promise<unknown> {
    return http.post(ENDPOINTS.DATABASE.rows(app, tableName), { data });
  },
  async updateRow(app: AppTarget, tableName: string, pk: Row, data: Row): Promise<unknown> {
    return http.put(ENDPOINTS.DATABASE.rows(app, tableName), { pk, data });
  },
  async deleteRow(app: AppTarget, tableName: string, pk: Row): Promise<unknown> {
    return http.delete(ENDPOINTS.DATABASE.rows(app, tableName), { pk });
  },
  // recordHistory is false when only turning to another page of a result that was already run —
  // that isn't a new query, so it must not be added to the saved history.
  async runQuery(app: AppTarget, query: string, page = 1, pageSize = 15, recordHistory = true): Promise<SqlQueryResponse> {
    return http.post<SqlQueryResponse>(ENDPOINTS.DATABASE.query(app), {
      query, page, page_size: pageSize, record_history: recordHistory,
    });
  },
  // Splits a pasted script into its statements using SQLite's own parser (server side), so a
  // semicolon inside a string, a comment or a trigger body is never mistaken for a statement end.
  async splitSql(app: AppTarget, query: string): Promise<string[]> {
    const res = await http.post<SqlSplitResponse>(ENDPOINTS.DATABASE.splitSql(app), { query });
    return res.statements;
  },
  async sqlHistory(app: AppTarget): Promise<SqlHistoryEntry[]> {
    return http.get<SqlHistoryEntry[]>(ENDPOINTS.DATABASE.sqlHistory(app));
  },
  async clearSqlHistory(app: AppTarget): Promise<void> {
    return http.delete<void>(ENDPOINTS.DATABASE.sqlHistory(app));
  },
  async listBackups(app: AppTarget): Promise<BackupInfo[]> {
    return http.get<BackupInfo[]>(ENDPOINTS.DATABASE.backups(app));
  },
  async createBackup(app: AppTarget): Promise<BackupInfo> {
    return http.post<BackupInfo>(ENDPOINTS.DATABASE.backups(app));
  },
  async downloadBackup(app: AppTarget, filename: string): Promise<Blob> {
    return httpBlob(ENDPOINTS.DATABASE.backupFile(app, filename));
  },
  async restoreBackup(app: AppTarget, filename: string): Promise<RestoreBackupResponse> {
    return http.post<RestoreBackupResponse>(ENDPOINTS.DATABASE.backupRestore(app, filename));
  },
  async deleteBackup(app: AppTarget, filename: string): Promise<DeleteBackupResponse> {
    return http.delete<DeleteBackupResponse>(ENDPOINTS.DATABASE.backupFile(app, filename));
  },
  async listBackupTables(app: AppTarget, filename: string): Promise<TableInfo[]> {
    return http.get<TableInfo[]>(ENDPOINTS.DATABASE.backupTables(app, filename));
  },
  async getBackupRows(app: AppTarget, filename: string, tableName: string, page: number, pageSize: number, search: string): Promise<RowsResponse> {
    return http.get<RowsResponse>(ENDPOINTS.DATABASE.backupRows(app, filename, tableName), {
      params: { page, page_size: pageSize, search },
    });
  },
  async getBackupRow(app: AppTarget, filename: string, tableName: string, pk: Row): Promise<Row | null> {
    const res = await http.get<{ row: Row | null }>(ENDPOINTS.DATABASE.backupRow(app, filename, tableName), {
      params: { pk: JSON.stringify(pk) },
    });
    return res.row;
  },
};

