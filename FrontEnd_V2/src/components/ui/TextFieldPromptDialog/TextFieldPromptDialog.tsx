import { useEffect, useRef, useState } from "react";
import { Modal } from "react-bootstrap";
import { PencilSquare } from "react-bootstrap-icons";

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
  const canConfirm = Boolean(trimmedValue);

  return (
    <Modal show={show} onHide={onCancel} centered backdrop="static">
      <Modal.Body className="p-4 text-field-prompt-dialog">
        <div className="empty-icon mx-auto mb-3" aria-hidden="true">
          <PencilSquare size={24} />
        </div>
        <h2 className="h5 fw-bold text-center">{title}</h2>
        {message && <p className="text-muted-2 mb-3 text-center">{message}</p>}

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