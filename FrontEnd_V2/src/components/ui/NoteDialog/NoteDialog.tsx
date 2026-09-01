import { useEffect, useRef, useState } from "react";
import { Modal } from "react-bootstrap";
import { ChatSquareDots } from "react-bootstrap-icons";

import "@/components/ui/NoteDialog/NoteDialog.scss";

interface NoteDialogProps {
  show: boolean;
  initialValue?: string;
  busy?: boolean;
  onConfirm: (note: string) => void;
  onCancel: () => void;
  onConfirmAndDone?: (note: string) => void;
}

export function NoteDialog({
  show,
  initialValue = "",
  busy = false,
  onConfirm,
  onCancel,
  onConfirmAndDone,
}: NoteDialogProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (show) {
      setValue(initialValue);

      const id = window.requestAnimationFrame(() => {
        textareaRef.current?.focus();
      });

      return () => window.cancelAnimationFrame(id);
    }
  }, [show, initialValue]);

  const isEditing = Boolean(initialValue);

  return (
    <Modal show={show} onHide={onCancel} centered backdrop="static">
      <Modal.Body className="p-4 note-dialog">
        <div className="note-dialog-header mb-3">
          <div className="empty-icon" aria-hidden="true">
            <ChatSquareDots size={24} />
          </div>
          <div>
            <h2 className="h5 fw-bold mb-0">
              {isEditing ? "Edit your note" : "Add a note"}
            </h2>
            <p className="text-muted-2 mb-0">
              {isEditing
                ? "Make changes to your note or add a new update."
                : "Jot down a thought or update for this plan item."}
            </p>
          </div>
        </div>

        <textarea
          ref={textareaRef}
          className="form-control"
          rows={4}
          value={value}
          placeholder="Write a note…"
          maxLength={200}
          onChange={(e) => {
            const next = e.target.value;
            if (next.split("\n").length <= 4) setValue(next);
          }}
          disabled={busy}
        />

        <span className="text-limit">{value.length}/200</span>

        <div className="d-flex gap-2 justify-content-end">
          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>
          {onConfirmAndDone && (
            <button
              type="button"
              className="btn btn-soft"
              onClick={() => onConfirmAndDone(value.trim())}
              disabled={busy}
            >
              {busy ? "Saving…" : "Save & Done"}
            </button>
          )}
          <button
            type="button"
            className="btn btn-brand"
            onClick={() => onConfirm(value.trim())}
            disabled={busy}
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </Modal.Body>
    </Modal>
  );
}
