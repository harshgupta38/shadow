import type { Row, TableInfo } from "@/api";

export function pkColumns(table: TableInfo) {
  return table.columns.filter((c) => c.pk);
}

// Stable identity string for a row — handles composite PKs (e.g. ip_rate_limits: ip+kind).
export function rowKey(table: TableInfo, row: Row): string {
  return pkColumns(table).map((c) => String(row[c.name])).join("::");
}

// Human-friendly label for a row's identity, used in confirm dialogs / modal titles.
export function rowLabel(table: TableInfo, row: Row): string {
  const pks = pkColumns(table);
  if (pks.length === 1) return `#${String(row[pks[0].name])}`;
  return pks.map((c) => `${c.name}=${String(row[c.name])}`).join(", ");
}

// Just the primary-key subset of a row — what update/delete send as `pk`.
export function pkValues(table: TableInfo, row: Row): Row {
  const result: Row = {};
  for (const c of pkColumns(table)) result[c.name] = row[c.name];
  return result;
}
