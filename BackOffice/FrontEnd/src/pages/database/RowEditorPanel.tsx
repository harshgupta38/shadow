import { forwardRef, useImperativeHandle, useMemo, useState } from "react";
import { Modal } from "react-bootstrap";
import { ArrowClockwise, ArrowCounterclockwise, ArrowLeft, PlusLg, SaveFill, TrashFill } from "react-bootstrap-icons";
import { api, ApiError } from "@/api";
import type { ColumnInfo, Row, TableInfo } from "@/api";
import { pkValues, rowLabel } from "./dbHelpers";

type FormValue = string | boolean | string[];

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

// A JSON column whose model annotation is precise enough (list[str] /
// list[int]) to edit as a real list of items instead of raw text. Anything
// else JSON-typed (nested dicts, list[dict], or a JSON column with no
// model info at all) falls back to the plain textarea further down.
function isListShape(col: ColumnInfo): boolean {
  return col.json_shape === "list_str" || col.json_shape === "list_int";
}

function computeListItemRows(value: string): number {
  if (!value) return 1;
  const lines = value.split("\n");
  const wrapped = lines.reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / 60)), 0);
  return Math.min(Math.max(1, wrapped), 6);
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

function buildInitialForm(table: TableInfo, row: Row | null): Record<string, FormValue> {
  const form: Record<string, FormValue> = {};
  for (const col of table.columns) {
    const value = row ? row[col.name] : undefined;
    if (isBoolean(col)) {
      form[col.name] = value === undefined ? false : Boolean(value);
    } else if (isListShape(col)) {
      form[col.name] = Array.isArray(value) ? value.map(String) : [];
    } else {
      form[col.name] = formatFieldValue(col, value ?? null);
    }
  }
  return form;
}

interface ListFieldEditorProps {
  items: string[];
  itemType: "list_str" | "list_int";
  onChange: (items: string[]) => void;
  disabled?: boolean;
  invalid?: boolean;
}

// The structured editor for list[str] / list[int] columns — each array
// item gets its own row (a growing textarea for strings, so a long
// sentence never gets crushed into one line; a number input for ints),
// with add/remove controls. The user only ever touches plain values, never
// JSON syntax, so there's nothing here for them to break the format with.
function ListFieldEditor({ items, itemType, onChange, disabled, invalid }: ListFieldEditorProps) {
  function updateItem(i: number, value: string) {
    const next = items.slice();
    next[i] = value;
    onChange(next);
  }
  function removeItem(i: number) {
    onChange(items.filter((_, idx) => idx !== i));
  }
  function addItem() {
    onChange([...items, ""]);
  }

  return (
    <div className={`db-list-editor${invalid ? " db-list-editor--invalid" : ""}`}>
      {items.length === 0 && <p className="db-list-editor-empty">No items yet.</p>}
      {items.map((item, i) => (
        <div key={i} className="db-list-editor-row">
          <span className="db-list-editor-index">{i + 1}</span>
          {itemType === "list_int" ? (
            <input
              type="number"
              className="form-control"
              value={item}
              onChange={(e) => updateItem(i, e.target.value)}
              disabled={disabled}
            />
          ) : (
            <textarea
              className="form-control"
              rows={computeListItemRows(item)}
              value={item}
              onChange={(e) => updateItem(i, e.target.value)}
              disabled={disabled}
            />
          )}
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            onClick={() => removeItem(i)}
            disabled={disabled}
            aria-label={`Remove item ${i + 1}`}
          >
            <TrashFill size={13} />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn btn-soft-secondary btn-sm d-flex align-items-center gap-2"
        onClick={addItem}
        disabled={disabled}
      >
        <PlusLg size={13} />
        Add item
      </button>
    </div>
  );
}

interface RowEditorPanelProps {
  table: TableInfo;
  row: Row | null;
  onClose: () => void;
  onSave: () => void;
  onDelete: () => void;
}

// Lets a caller (TableBrowser, switching tables) ask the panel to step
// aside — if there are unsaved changes it interrupts with a save/discard
// prompt instead of proceeding immediately.
export interface RowEditorPanelHandle {
  confirmNavigateAway(onProceed: () => void): void;
}

// Renders in place of the table grid inside .db-main (never a modal/popup) —
// same list-to-detail pattern as SAP's table editors. Field inputs lay out
// in a responsive grid capped at 5 columns (see .db-row-form-grid).
export const RowEditorPanel = forwardRef<RowEditorPanelHandle, RowEditorPanelProps>(
  function RowEditorPanel({ table, row, onClose, onSave, onDelete }, ref) {
  const isCreate = row === null;
  const [initialForm, setInitialForm] = useState(() => buildInitialForm(table, row));
  const [form, setForm] = useState(initialForm);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pendingLeave, setPendingLeave] = useState<(() => void) | null>(null);

  const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm);
  const busy = submitting || deleting || refreshing;

  const editableColumns = useMemo(
    () => table.columns.filter((c) => !(isCreate && c.pk)),
    [table.columns, isCreate],
  );

  function guardedLeave(proceed: () => void) {
    if (isDirty) {
      setPendingLeave(() => proceed);
    } else {
      proceed();
    }
  }

  useImperativeHandle(ref, () => ({
    confirmNavigateAway: guardedLeave,
  }), [isDirty]);

  function requestClose() {
    guardedLeave(onClose);
  }

  function setField(name: string, value: FormValue) {
    setForm((prev) => ({ ...prev, [name]: value }));
    if (fieldErrors[name]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  }

  // Returns whether the save succeeded — shared by the normal submit button
  // and the "Save changes" option in the unsaved-changes prompt below.
  async function saveNow(): Promise<boolean> {
    setFormError(null);

    const parseErrors: Record<string, string> = {};
    const data: Row = {};

    for (const col of editableColumns) {
      if (col.pk) continue; // identifies the row, isn't part of the change
      const raw = form[col.name];

      if (isBoolean(col)) {
        data[col.name] = Boolean(raw);
        continue;
      }

      if (isListShape(col)) {
        const items = Array.isArray(raw) ? raw : [];
        if (col.json_shape === "list_int") {
          const numbers: number[] = [];
          let bad = false;
          for (const item of items) {
            const trimmed = item.trim();
            if (trimmed === "") continue; // a blank row just isn't a number yet — drop it, don't error
            if (!/^-?\d+$/.test(trimmed)) { bad = true; break; }
            numbers.push(Number(trimmed));
          }
          if (bad) {
            parseErrors[col.name] = "Every item must be a whole number.";
            continue;
          }
          data[col.name] = numbers;
        } else {
          data[col.name] = items; // list_str: sent as-is, blanks included — that's the user's own call to make
        }
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
          parseErrors[col.name] = "Invalid JSON";
        }
      } else {
        data[col.name] = text;
      }
    }

    if (Object.keys(parseErrors).length > 0) {
      setFieldErrors(parseErrors);
      return false;
    }

    setFieldErrors({});
    setSubmitting(true);
    try {
      if (isCreate) {
        await api.database.insertRow(table.name, data);
      } else {
        await api.database.updateRow(table.name, pkValues(table, row), data);
      }
      onSave();
      return true;
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message);
        setFieldErrors(err.fieldErrors ?? {});
      } else {
        setFormError("Could not save the row.");
      }
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await saveNow();
  }

  // Re-fetches this row from the database — someone else (or another admin
  // session) may have changed it since this panel loaded.
  async function handleRefresh() {
    if (isCreate || !row) return;
    setRefreshing(true);
    setFormError(null);
    try {
      const fresh = await api.database.getRow(table.name, pkValues(table, row));
      if (fresh === null) {
        setFormError("This row no longer exists — it may have been deleted.");
        return;
      }
      const nextForm = buildInitialForm(table, fresh);
      setInitialForm(nextForm);
      setForm(nextForm);
      setFieldErrors({});
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not refresh this row.");
    } finally {
      setRefreshing(false);
    }
  }

  // Reverts in-progress edits back to what was loaded when this panel opened.
  function handleRestore() {
    setForm(initialForm);
    setFieldErrors({});
    setFormError(null);
  }

  async function handleSaveAndLeave() {
    const ok = await saveNow();
    const proceed = pendingLeave;
    setPendingLeave(null);
    if (ok) proceed?.();
  }

  function handleDiscardAndLeave() {
    const proceed = pendingLeave;
    setPendingLeave(null);
    proceed?.();
  }

  function handleCancelLeave() {
    setPendingLeave(null);
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
    <div className="db-row-panel">
      <div className="db-row-panel-header">
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          onClick={requestClose}
          disabled={busy}
          aria-label="Back to table"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="min-w-0">
          <h2 className="db-table-title">{isCreate ? `New row in ${table.name}` : table.name}</h2>
          <p className="db-table-meta">{isCreate ? "Fill in the fields below." : rowLabel(table, row)}</p>
        </div>

        <div className="db-row-panel-actions">
          {!isCreate && (
            <button
              type="button"
              className="btn btn-soft-secondary text-nowrap d-flex align-items-center gap-2"
              onClick={() => void handleRefresh()}
              disabled={busy}
              aria-label="Refresh from database"
              title="Refresh from database"
            >
              {refreshing ? <span className="spinner-border spinner-border-sm" /> : <ArrowClockwise size={14} />}
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
          )}
          <button
            type="button"
            className="btn btn-soft-secondary text-nowrap d-flex align-items-center gap-2"
            onClick={handleRestore}
            disabled={!isDirty || busy}
            aria-label="Restore original data"
            title="Discard edits, restore original data"
          >
            <ArrowCounterclockwise size={14} />
            Restore
          </button>
          <button
            type="button"
            className="btn btn-soft text-nowrap d-flex align-items-center gap-2"
            onClick={() => void saveNow()}
            disabled={!isDirty || busy}
            aria-label="Save changes"
            title="Save changes"
          >
            {submitting ? <span className="spinner-border spinner-border-sm" /> : <SaveFill size={14} />}
            {submitting ? "Saving…" : "Save"}
          </button>
          {!isCreate && (
            <button
              type="button"
              className="btn btn-soft-danger btn-icon"
              onClick={() => setConfirmingDelete(true)}
              disabled={busy}
              aria-label="Delete row"
              title="Delete row"
            >
              <TrashFill size={16} />
            </button>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="db-row-panel-form">
        <div className="db-row-panel-body">
          {formError && (
            <div className="alert alert-danger py-2 px-3 small mb-3" role="alert">{formError}</div>
          )}
          <div className="db-row-form-grid">
            {editableColumns.map((col) => {
              const error = fieldErrors[col.name];
              return (
                <div
                  key={col.name}
                  className={`db-field${isLongText(col) || isJson(col) || isListShape(col) ? " db-field--wide" : ""}`}
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
                  ) : isListShape(col) ? (
                    <ListFieldEditor
                      items={Array.isArray(form[col.name]) ? (form[col.name] as string[]) : []}
                      itemType={col.json_shape as "list_str" | "list_int"}
                      onChange={(items) => setField(col.name, items)}
                      disabled={busy}
                      invalid={Boolean(error)}
                    />
                  ) : isJson(col) ? (
                    <textarea
                      className={`form-control db-field-mono${error ? " is-invalid" : ""}`}
                      rows={4}
                      value={String(form[col.name] ?? "")}
                      onChange={(e) => setField(col.name, e.target.value)}
                    />
                  ) : isLongText(col) ? (
                    <textarea
                      className={`form-control${error ? " is-invalid" : ""}`}
                      rows={2}
                      value={String(form[col.name] ?? "")}
                      onChange={(e) => setField(col.name, e.target.value)}
                    />
                  ) : (
                    <input
                      className={`form-control${error ? " is-invalid" : ""}`}
                      type={isInteger(col) ? "number" : isDateOnly(col) ? "date" : "text"}
                      value={String(form[col.name] ?? "")}
                      onChange={(e) => setField(col.name, e.target.value)}
                      placeholder={isDateTime(col) ? "YYYY-MM-DD HH:MM:SS" : undefined}
                    />
                  )}
                  {error && <div className="db-field-error">{error}</div>}
                </div>
              );
            })}
          </div>
        </div>
      </form>

      {pendingLeave && (
        <Modal show onHide={handleCancelLeave} centered className="deploy-modal">
          <Modal.Header>
            <h5 className="deploy-modal-title">Unsaved changes</h5>
            <button type="button" className="btn btn-ghost btn-icon" onClick={handleCancelLeave} aria-label="Close">
              ×
            </button>
          </Modal.Header>
          <Modal.Body>
            <p className="mb-0">
              This {isCreate ? "new row" : "row"} has unsaved changes. Save them before leaving, or discard them?
            </p>
          </Modal.Body>
          <Modal.Footer>
            <button type="button" className="btn btn-ghost" onClick={handleDiscardAndLeave} disabled={submitting}>
              Discard changes
            </button>
            <button type="button" className="btn btn-brand d-flex align-items-center gap-2" onClick={handleSaveAndLeave} disabled={submitting}>
              {submitting && <span className="spinner-border spinner-border-sm" />}
              {submitting ? "Saving…" : "Save changes"}
            </button>
          </Modal.Footer>
        </Modal>
      )}

      {confirmingDelete && (
        <Modal show onHide={() => !deleting && setConfirmingDelete(false)} centered className="deploy-modal">
          <Modal.Header>
            <h5 className="deploy-modal-title">Delete row</h5>
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              onClick={() => setConfirmingDelete(false)}
              disabled={deleting}
              aria-label="Close"
            >
              ×
            </button>
          </Modal.Header>
          <Modal.Body>
            <p className="mb-0">
              Delete this row from <strong>{table.name}</strong>? This can't be undone.
            </p>
          </Modal.Body>
          <Modal.Footer>
            <button type="button" className="btn btn-ghost" onClick={() => setConfirmingDelete(false)} disabled={deleting}>
              Cancel
            </button>
            <button type="button" className="btn btn-danger d-flex align-items-center gap-2" onClick={handleDelete} disabled={deleting}>
              {deleting && <span className="spinner-border spinner-border-sm" />}
              {deleting ? "Deleting…" : "Yes, delete"}
            </button>
          </Modal.Footer>
        </Modal>
      )}
    </div>
  );
});
