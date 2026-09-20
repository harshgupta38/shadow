import { useMemo, useState } from "react";
import { Modal } from "react-bootstrap";
import { api, ApiError } from "@/api";
import type { ColumnInfo, Row, TableInfo } from "@/api";
import { pkValues, rowLabel } from "./dbHelpers";

const LONG_TEXT_HINTS = [
  "summary", "description", "note", "bio", "motivation", "reason",
  "context", "brief", "headline", "state", "definition",
];

function isLongText(col: ColumnInfo): boolean {
  return LONG_TEXT_HINTS.some((hint) => col.name.includes(hint));
}

function isBoolean(col: ColumnInfo): boolean {
  return col.type.includes("BOOL");
}

function isJson(col: ColumnInfo): boolean {
  return col.type.includes("JSON");
}

function isInteger(col: ColumnInfo): boolean {
  return col.type.includes("INT");
}

function isDateOnly(col: ColumnInfo): boolean {
  return col.type === "DATE";
}

function isDateTime(col: ColumnInfo): boolean {
  return col.type.includes("DATETIME") || col.type.includes("TIMESTAMP");
}

function formatFieldValue(col: ColumnInfo, value: unknown): string {
  if (value === null || value === undefined) return "";
  if (isJson(col)) return JSON.stringify(value, null, 2);
  return String(value);
}

function buildInitialForm(table: TableInfo, row: Row | null): Record<string, string | boolean> {
  const form: Record<string, string | boolean> = {};
  for (const col of table.columns) {
    const value = row ? row[col.name] : undefined;
    if (isBoolean(col)) {
      form[col.name] = value === undefined ? false : Boolean(value);
    } else {
      form[col.name] = formatFieldValue(col, value ?? null);
    }
  }
  return form;
}

interface RowEditorModalProps {
  table: TableInfo;
  row: Row | null;
  onClose: () => void;
  onSave: () => void;
  onDelete: () => void;
}

export function RowEditorModal({ table, row, onClose, onSave, onDelete }: RowEditorModalProps) {
  const isCreate = row === null;
  const [form, setForm] = useState(() => buildInitialForm(table, row));
  const [jsonErrors, setJsonErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const editableColumns = useMemo(
    () => table.columns.filter((c) => !(isCreate && c.pk)),
    [table.columns, isCreate],
  );

  function setField(name: string, value: string | boolean) {
    setForm((prev) => ({ ...prev, [name]: value }));
    if (jsonErrors[name]) {
      setJsonErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const errors: Record<string, string> = {};
    const data: Row = {};

    for (const col of editableColumns) {
      if (col.pk) continue; // identifies the row, isn't part of the change
      const raw = form[col.name];

      if (isBoolean(col)) {
        data[col.name] = Boolean(raw);
        continue;
      }

      const text = String(raw ?? "").trim();
      if (text === "") {
        data[col.name] = null;
        continue;
      }

      if (isJson(col)) {
        try {
          data[col.name] = JSON.parse(text);
        } catch {
          errors[col.name] = "Invalid JSON";
        }
      } else {
        data[col.name] = text;
      }
    }

    if (Object.keys(errors).length > 0) {
      setJsonErrors(errors);
      return;
    }

    setJsonErrors({});
    setSubmitting(true);
    try {
      if (isCreate) {
        await api.database.insertRow(table.name, data);
      } else {
        await api.database.updateRow(table.name, pkValues(table, row), data);
      }
      onSave();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not save the row.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!row) return;
    setDeleting(true);
    setFormError(null);
    try {
      await api.database.deleteRow(table.name, pkValues(table, row));
      onDelete();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not delete the row.");
      setConfirmingDelete(false);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Modal show onHide={() => !submitting && !deleting && onClose()} centered size="lg" className="deploy-modal db-row-modal">
      <Modal.Header>
        <h5 className="deploy-modal-title">
          {isCreate ? `New row in ${table.name}` : `Edit ${table.name} · ${row ? rowLabel(table, row) : ""}`}
        </h5>
        <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} disabled={submitting || deleting} aria-label="Close">
          ×
        </button>
      </Modal.Header>
      <form onSubmit={handleSubmit}>
        <Modal.Body className="db-row-modal-body">
          {formError && (
            <div className="alert alert-danger py-2 px-3 small mb-3" role="alert">{formError}</div>
          )}
          <div className="db-row-form-grid">
            {editableColumns.map((col) => (
              <div
                key={col.name}
                className={`db-field${isLongText(col) || isJson(col) ? " db-field--wide" : ""}`}
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
                ) : isBoolean(col) ? (
                  <div className="form-check form-switch db-field-switch">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      role="switch"
                      checked={Boolean(form[col.name])}
                      onChange={(e) => setField(col.name, e.target.checked)}
                    />
                  </div>
                ) : isJson(col) ? (
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
                    type={isInteger(col) ? "number" : isDateOnly(col) ? "date" : "text"}
                    value={String(form[col.name] ?? "")}
                    onChange={(e) => setField(col.name, e.target.value)}
                    placeholder={isDateTime(col) ? "YYYY-MM-DD HH:MM:SS" : undefined}
                  />
                )}
              </div>
            ))}
          </div>
        </Modal.Body>
        <Modal.Footer>
          {confirmingDelete ? (
            <div className="d-flex align-items-center justify-content-between w-100 gap-3">
              <span className="small text-muted-2">
                Delete this row from <strong>{table.name}</strong>? This can't be undone.
              </span>
              <div className="d-flex gap-2 flex-shrink-0">
                <button type="button" className="btn btn-ghost" onClick={() => setConfirmingDelete(false)} disabled={deleting}>
                  Cancel
                </button>
                <button type="button" className="btn btn-danger d-flex align-items-center gap-2" onClick={handleDelete} disabled={deleting}>
                  {deleting && <span className="spinner-border spinner-border-sm" />}
                  {deleting ? "Deleting…" : "Yes, delete"}
                </button>
              </div>
            </div>
          ) : (
            <>
              {!isCreate && (
                <button
                  type="button"
                  className="btn btn-danger me-auto"
                  onClick={() => setConfirmingDelete(true)}
                  disabled={submitting}
                >
                  Delete
                </button>
              )}
              <button type="button" className="btn btn-ghost" onClick={onClose} disabled={submitting}>
                Cancel
              </button>
              <button type="submit" className="btn btn-brand d-flex align-items-center gap-2" disabled={submitting}>
                {submitting && <span className="spinner-border spinner-border-sm" />}
                {submitting ? "Saving…" : isCreate ? "Create row" : "Save changes"}
              </button>
            </>
          )}
        </Modal.Footer>
      </form>
    </Modal>
  );
}
