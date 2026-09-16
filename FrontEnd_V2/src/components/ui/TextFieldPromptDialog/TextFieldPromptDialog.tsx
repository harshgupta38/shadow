import { useEffect, useRef, useState } from "react";
import { Modal } from "react-bootstrap";
import { PencilSquare } from "react-bootstrap-icons";

import "@/components/ui/NoteDialog/NoteDialog.scss";
import "@/components/ui/TextFieldPromptDialog/TextFieldPromptDialog.scss";

interface TextFieldPromptDialogProps {
  show: boolean;
  title: string;
  message?: string;
  label: string;
  initialValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  maxLength?: number;
  /** Allow confirming with an empty value — e.g. to clear an override and
   *  fall back to a default. Off by default (empty input disables confirm). */
  allowEmpty?: boolean;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

export function TextFieldPromptDialog({
  show,
  title,
  message,
  label,
  initialValue = "",
  placeholder,
  confirmLabel = "Save",
  cancelLabel = "Cancel",
  busy = false,
  maxLength,
  allowEmpty = false,
  onConfirm,
  onCancel,
}: TextFieldPromptDialogProps) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (show) {
      setValue(initialValue);

      const id = window.requestAnimationFrame(() => {
        inputRef.current?.focus();
      });

      return () => window.cancelAnimationFrame(id);
    }
  }, [show, initialValue]);

  const trimmedValue = value.trim();
  const canConfirm = allowEmpty || Boolean(trimmedValue);

  return (
    <Modal show={show} onHide={onCancel} centered backdrop="static">
      <Modal.Body className="p-4 text-field-prompt-dialog">
        <div className="note-dialog-header mb-3">
          <div className="empty-icon" aria-hidden="true">
            <PencilSquare size={24} />
          </div>
          <div>
            <h2 className="h5 fw-bold mb-0">{title}</h2>
            {message && <p className="text-muted-2 mb-0">{message}</p>}
          </div>
        </div>

        <label htmlFor="text-field-prompt-input" className="form-label fw-semibold">
          {label}
        </label>
        <input
          ref={inputRef}
          id="text-field-prompt-input"
          type="text"
          className="form-control"
          value={value}
          placeholder={placeholder}
          maxLength={maxLength}
          autoComplete="off"
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && canConfirm && !busy) {
              event.preventDefault();
              onConfirm(trimmedValue);
            }
          }}
          disabled={busy}
        />

        <div className="d-flex gap-2 justify-content-end mt-4">
          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="btn btn-brand"
            onClick={() => onConfirm(trimmedValue)}
            disabled={busy || !canConfirm}
          >
            {busy ? "Working..." : confirmLabel}
          </button>
        </div>
      </Modal.Body>
    </Modal>
  );
}