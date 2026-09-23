import { ArrowLeft } from "react-bootstrap-icons";
import type { Row, TableInfo } from "@/api";
import { formatBytes, isBinaryPlaceholder, rowLabel } from "./dbHelpers";

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (isBinaryPlaceholder(value)) return `Binary data (${formatBytes(value.size_bytes)})`;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

// Purely a viewer — no inputs, no state, nothing that could be mistaken for
// an edit control. Every field is plain text (or a <pre> for JSON), so
// there's no path from "opened a row" to "changed a row" here at all,
// which is the actual guarantee behind "read-only" — not just a disabled
// input, a component that never had the capability to write in the first
// place.
export function BackupRowViewer({ table, row, onClose }: { table: TableInfo; row: Row; onClose: () => void }) {
  return (
    <div className="db-row-panel">
      <div className="db-row-panel-header">
        <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Back to table">
          <ArrowLeft size={16} />
        </button>
        <div className="min-w-0">
          <h2 className="db-table-title">{table.name}</h2>
          <p className="db-table-meta">{rowLabel(table, row)} · read-only</p>
        </div>
      </div>

      <div className="db-row-panel-body">
        <div className="db-row-form-grid">
          {table.columns.map((col) => {
            const value = row[col.name];
            const isJson = col.type === "JSON" || (typeof value === "object" && value !== null && !isBinaryPlaceholder(value));
            return (
              <div key={col.name} className={`db-field${isJson ? " db-field--wide" : ""}`}>
                <label className="form-label db-field-label">
                  {col.name}
                  {col.pk && <span className="db-col-badge db-col-badge--pk">PK</span>}
                  {col.fk && <span className="db-col-badge db-col-badge--fk">FK</span>}
                </label>

                {value === null || value === undefined ? (
                  <div className="form-control db-field-readonly">
                    <span className="db-cell-null">NULL</span>
                  </div>
                ) : isJson ? (
                  <pre className="form-control db-field-mono db-field-readonly">{formatValue(value)}</pre>
                ) : (
                  <div className="form-control db-field-readonly">{formatValue(value)}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
