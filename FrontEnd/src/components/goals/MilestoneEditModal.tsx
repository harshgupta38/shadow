import { useEffect, useMemo, useState } from "react";
import { Modal } from "react-bootstrap";
import ReactQuill from "react-quill";

import type { Milestone } from "@/api";

interface MilestoneEditModalProps {
  show: boolean;
  milestone: Milestone | null;
  busy?: boolean;
  onClose: () => void;
  onSave: (payload: {
    title: string;
    description: string | null;
    dueDate: string | null;
  }) => Promise<void>;
}

const QUILL_MODULES = {
  toolbar: [
    [{ header: [2, 3, false] }],
    ["bold", "italic", "underline"],
    [{ list: "ordered" }, { list: "bullet" }],
    ["blockquote", "code-block"],
    ["link"],
    ["clean"],
  ],
};

const QUILL_FORMATS = [
  "header",
  "bold",
  "italic",
  "underline",
  "list",
  "bullet",
  "blockquote",
  "code-block",
  "link",
];

function normaliseHtml(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "<p><br></p>") return "";
  return trimmed;
}

function descriptionToEditorValue(value: string | null): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";

  if (/<\/?[a-z][\s\S]*>/i.test(trimmed)) {
    return trimmed;
  }

  const escaped = trimmed
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<p>${escaped.replace(/\r?\n/g, "</p><p>")}</p>`;
}

function dueDateToInputValue(value: string | null | undefined): string {
  if (!value) return "";
  return value.slice(0, 10);
}

export function MilestoneEditModal({
  show,
  milestone,
  busy = false,
  onClose,
  onSave,
}: MilestoneEditModalProps) {
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!show) return;
    setTitle(milestone?.title ?? "");
    setDueDate(dueDateToInputValue(milestone?.due_date));
    setDescription(descriptionToEditorValue(milestone?.description ?? null));
  }, [show, milestone]);

  const canSave = useMemo(() => title.trim().length > 0 && !busy, [title, busy]);
  const isEditing = !!milestone;

  async function handleSave() {
    const nextTitle = title.trim();
    if (!nextTitle) return;

    const nextDescription = normaliseHtml(description);
    await onSave({
      title: nextTitle,
      description: nextDescription || null,
      dueDate: dueDate || null,
    });
  }

  return (
    <Modal show={show} onHide={busy ? undefined : onClose} centered size="lg" backdrop="static">
      <Modal.Header closeButton={!busy}>
        <Modal.Title className="h5 fw-bold">{isEditing ? "Edit milestone" : "Add milestone"}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div className="row g-3 mb-3">
          <div className="col-12 col-md-8">
            <label className="form-label">Title</label>
            <input
              className="form-control"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={busy}
              maxLength={255}
              placeholder="Milestone title"
            />
          </div>
          <div className="col-12 col-md-4">
            <label className="form-label">Due date</label>
            <input
              type="date"
              className="form-control"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              disabled={busy}
            />
          </div>
        </div>

        <label className="form-label">Description</label>
        <ReactQuill
          className="milestone-editor"
          theme="snow"
          value={description}
          onChange={setDescription}
          modules={QUILL_MODULES}
          formats={QUILL_FORMATS}
          readOnly={busy}
          placeholder="Write milestone details with formatting..."
        />
      </Modal.Body>
      <Modal.Footer>
        <button className="btn btn-outline-secondary" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button className="btn btn-brand" onClick={() => void handleSave()} disabled={!canSave}>
          {busy ? "Saving..." : isEditing ? "Save changes" : "Add milestone"}
        </button>
      </Modal.Footer>
    </Modal>
  );
}
