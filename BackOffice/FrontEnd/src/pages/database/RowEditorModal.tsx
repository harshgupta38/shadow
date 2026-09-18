import { useMemo, useState } from "react";
import { Modal } from "react-bootstrap";
import { pkColumns, rowLabel, type ColumnDef, type Row, type TableDef } from "./schema";

const LONG_TEXT_HINTS = [
  "summary", "description", "note", "bio", "motivation", "reason",
  "context", "brief", "headline", "state", "definition",
];

function isLongText(col: ColumnDef): boolean {
  return LONG_TEXT_HINTS.some((hint) => col.name.includes(hint));
}

function formatFieldValue(col: ColumnDef, value: unknown): string {
  if (value === null || value === undefined) return "";
  if (col.type === "json") return JSON.stringify(value, null, 2);
  return String(value);
}

function buildInitialForm(table: TableDef, row: Row | null): Record<string, string | boolean> {
  const form: Record<string, string | boolean> = {};
  for (const col of table.columns) {
    const value = row ? row[col.name] : undefined;
    if (col.type === "boolean") {
      form[col.name] = value === undefined ? false : Boolean(value);
    } else {
      form[col.name] = formatFieldValue(col, value ?? null);
    }
  }
  return form;
}

interface RowEditorModalProps {
  table: TableDef;
  row: Row | null;
  onClose: () => void;
  onSave: (row: Row) => void;
}

export function RowEditorModal({ table, row, onClose, onSave }: RowEditorModalProps) {
  const isCreate = row === null;
  const [form, setForm] = useState(() => buildInitialForm(table, row));
  const [jsonErrors, setJsonErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const editableColumns = useMemo(
    () => table.columns.filter((c) => !(isCreate && c.pk)),
    [table.columns, isCreate],
  );

  function setField(name: string, value: string | boolean) {
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const errors: Record<string, string> = {};
    const result: Row = row ? { ...row } : {};

    for (const col of table.columns) {
      if (isCreate && col.pk) continue;
      const raw = form[col.name];

      if (col.type === "boolean") {
        result[col.name] = Boolean(raw);
        continue;
      }

      const text = String(raw ?? "").trim();
      if (text === "") {
        result[col.name] = null;
        continue;
      }

      if (col.type === "integer") {
        const n = Number(text);
        result[col.name] = Number.isFinite(n) ? n : text;
      } else if (col.type === "json") {
        try {
          result[col.name] = JSON.parse(text);
        } catch {
          errors[col.name] = "Invalid JSON";
        }
      } else {
        result[col.name] = text;
      }
    }

    if (Object.keys(errors).length > 0) {
      setJsonErrors(errors);
      return;
    }

    setJsonErrors({});
    setSubmitting(true);
    setTimeout(() => {
      if (isCreate) {
        for (const pkCol of pkColumns(table)) {
          result[pkCol.name] = pkCol.type === "integer"
            ? Math.floor(Math.random() * 90000) + 10000
            : `auto-${Math.random().toString(36).slice(2, 8)}`;
        }
      }
      setSubmitting(false);
      onSave(result);
    }, 400);
  }

  return (
    <Modal show onHide={() => !submitting && onClose()} centered size="lg" className="deploy-modal db-row-modal">
      <Modal.Header>
        <h5 className="deploy-modal-title">
          {isCreate ? `New row in ${table.name}` : `Edit ${table.name} · ${row ? rowLabel(table, row) : ""}`}
        </h5>
        <button className="btn btn-ghost btn-icon" onClick={onClose} disabled={submitting} aria-label="Close">
          ×
        </button>
      </Modal.Header>
      <form onSubmit={handleSubmit}>
        <Modal.Body className="db-row-modal-body">
          <div className="db-row-form-grid">
            {editableColumns.map((col) => (
              <div
                key={col.name}
                className={`db-field${isLongText(col) || col.type === "json" ? " db-field--wide" : ""}`}
              >
                <label className="form-label db-field-label">
                  {col.name}
                  {col.pk && <span className="db-col-badge db-col-badge--pk">PK</span>}
                  {col.fk && <span className="db-col-badge db-col-badge--fk">FK</span>}
                  {!col.nullable && !col.pk && <span className="db-field-required">*</span>}
                </label>

                {col.pk ? (
                  <input
                    className="form-control"
                    value={formatFieldValue(col, row?.[col.name] ?? "auto")}
                    disabled
                  />
                ) : col.type === "boolean" ? (
                  <div className="form-check form-switch db-field-switch">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      role="switch"
                      checked={Boolean(form[col.name])}
                      onChange={(e) => setField(col.name, e.target.checked)}
                    />
                  </div>
                ) : col.type === "json" ? (
                  <>
                    <textarea
                      className={`form-control db-field-mono${jsonErrors[col.name] ? " is-invalid" : ""}`}
                      rows={4}
                      value={String(form[col.name] ?? "")}
                      onChange={(e) => setField(col.name, e.target.value)}
                    />
                    {jsonErrors[col.name] && (
                      <div className="db-field-error">{jsonErrors[col.name]}</div>
                    )}
                  </>
                ) : isLongText(col) ? (
                  <textarea
                    className="form-control"
                    rows={2}
                    value={String(form[col.name] ?? "")}
                    onChange={(e) => setField(col.name, e.target.value)}
                  />
                ) : (
                  <input
                    className="form-control"
                    type={col.type === "integer" ? "number" : col.type === "date" ? "date" : "text"}
                    value={String(form[col.name] ?? "")}
                    onChange={(e) => setField(col.name, e.target.value)}
                    placeholder={col.type === "datetime" ? "YYYY-MM-DD HH:MM:SS" : undefined}
                  />
                )}
              </div>
            ))}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="submit" className="btn btn-brand d-flex align-items-center gap-2" disabled={submitting}>
            {submitting && <span className="spinner-border spinner-border-sm" />}
            {submitting ? "Saving…" : isCreate ? "Create row" : "Save changes"}
          </button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}
