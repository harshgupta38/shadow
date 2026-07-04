import { useState, type FormEvent } from "react";
import { Modal } from "react-bootstrap";
import { JournalText, PencilSquare, Trash3 } from "react-bootstrap-icons";

import { api, ApiError, type JournalEntry, type JournalMood } from "@/api";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { useToast } from "@/context/ToastContext";
import { useAsync } from "@/hooks/useAsync";
import { formatDateTime, relativeTime } from "@/lib/format";
import { MOOD_OPTIONS } from "@/lib/labels";

function moodEmoji(mood?: JournalMood | null): string | null {
  if (!mood) return null;
  return MOOD_OPTIONS.find((m) => m.label === mood)?.emoji ?? "📝";
}

function MoodPicker({
  value,
  onChange,
}: {
  value: JournalMood | null;
  onChange: (mood: JournalMood | null) => void;
}) {
  return (
    <div className="d-flex gap-1 flex-wrap">
      {MOOD_OPTIONS.map((mood) => (
        <button
          key={mood.label}
          type="button"
          className={`btn btn-sm ${value === mood.label ? "btn-soft" : "btn-ghost"}`}
          onClick={() => onChange(value === mood.label ? null : mood.label)}
          title={mood.label}
        >
          <span style={{ fontSize: "1.1rem" }}>{mood.emoji}</span>
        </button>
      ))}
    </div>
  );
}

export function JournalPage() {
  const toast = useToast();
  const { data, loading, error, reload, setData } = useAsync(() => api.journal.list(), []);

  const [content, setContent] = useState("");
  const [mood, setMood] = useState<JournalMood | null>(null);
  const [moodError, setMoodError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [editing, setEditing] = useState<JournalEntry | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editMood, setEditMood] = useState<JournalMood | null>(null);
  const [updating, setUpdating] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<JournalEntry | null>(null);
  const [deleting, setDeleting] = useState(false);

  const entries = data ?? [];

  async function createEntry(event: FormEvent) {
    event.preventDefault();
    if (!content.trim()) return;
    if (!mood) {
      const message = "Please select a mood before saving your entry.";
      setMoodError(message);
      toast.error(message);
      return;
    }

    setMoodError(null);
    setSaving(true);
    try {
      const entry = await api.journal.create({ content: content.trim(), mood });
      setData((prev) => [entry, ...(prev ?? [])]);
      setContent("");
      setMood(null);
      setMoodError(null);
      toast.success("Journal entry saved.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't save your entry.");
    } finally {
      setSaving(false);
    }
  }

  function openEdit(entry: JournalEntry) {
    setEditing(entry);
    setEditContent(entry.content);
    setEditMood(entry.mood);
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!editing || !editContent.trim()) return;
    setUpdating(true);
    try {
      const updated = await api.journal.update(editing.id, {
        content: editContent.trim(),
        mood: editMood,
      });
      setData((prev) => (prev ?? []).map((e) => (e.id === updated.id ? updated : e)));
      setEditing(null);
      toast.success("Entry updated.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't update the entry.");
    } finally {
      setUpdating(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.journal.remove(deleteTarget.id);
      setData((prev) => (prev ?? []).filter((e) => e.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast.success("Entry deleted.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't delete the entry.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Journal"
        subtitle="A quiet space to reflect. A few honest lines a day is plenty."
        icon={<JournalText size={20} />}
      />

      <div className="row g-4">
        <div className="col-12">
          <SectionCard title="New entry">
            <form onSubmit={createEntry}>
              <textarea
                className="form-control mb-3"
                rows={6}
                style={{ minHeight: 80, maxHeight: 140, height: 80, resize: "vertical" }}
                placeholder="What's on your mind? What went well today?"
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
              <div className="d-flex align-items-center justify-content-between gap-2 flex-wrap">
                <MoodPicker
                  value={mood}
                  onChange={(nextMood) => {
                    setMood(nextMood);
                    if (nextMood) {
                      setMoodError(null);
                    }
                  }}
                />
                <button className="btn btn-brand" disabled={saving || !content.trim()}>
                  {saving ? "Saving…" : "Save entry"}
                </button>
              </div>
              {moodError && <div className="text-danger small mt-2">{moodError}</div>}
            </form>
          </SectionCard>
        </div>

        <div className="col-12">
          {loading && <LoadingState label="Loading your journal…" />}

          {error && !loading && (
            <EmptyState
              icon={<JournalText size={26} />}
              title="Couldn't load your journal"
              message={error}
              action={
                <button className="btn btn-brand" onClick={reload}>
                  Retry
                </button>
              }
            />
          )}

          {!loading && !error && entries.length === 0 && (
            <div className="surface">
              <EmptyState
                icon={<JournalText size={26} />}
                title="Your journal is empty"
                message="Write your first reflection. Over time, Shadow learns from your patterns."
              />
            </div>
          )}

          {!loading && !error && entries.length > 0 && (
            <div className="d-flex flex-column gap-3">
              {entries.map((entry) => (
                <div className="surface p-4" key={entry.id}>
                  <div className="d-flex align-items-center justify-content-between gap-2 mb-2">
                    <div className="d-flex align-items-center gap-2">
                      {moodEmoji(entry.mood) && (
                        <span style={{ fontSize: "1.25rem" }}>{moodEmoji(entry.mood)}</span>
                      )}
                      <span
                        className="text-faint small"
                        title={formatDateTime(entry.created_at)}
                      >
                        {relativeTime(entry.created_at)}
                      </span>
                    </div>
                    <div className="d-flex gap-1">
                      <button
                        className="btn btn-ghost btn-icon"
                        style={{ width: 34, height: 34 }}
                        onClick={() => openEdit(entry)}
                        aria-label="Edit entry"
                      >
                        <PencilSquare size={15} />
                      </button>
                      <button
                        className="btn btn-ghost btn-icon"
                        style={{ width: 34, height: 34 }}
                        onClick={() => setDeleteTarget(entry)}
                        aria-label="Delete entry"
                      >
                        <Trash3 size={15} className="text-danger" />
                      </button>
                    </div>
                  </div>
                  <h6 className="mb-2 fw-semibold" style={{ whiteSpace: "pre-wrap", lineHeight: 1.4 }}>
                    {entry.content}
                  </h6>
                  <p className="mb-0 text-faint" style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                    {entry.shadow_response || "No shadow reflection yet."}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Edit modal */}
      <Modal show={!!editing} onHide={() => setEditing(null)} centered backdrop="static">
        <Modal.Header closeButton>
          <Modal.Title className="h5 fw-bold">Edit Journal</Modal.Title>
        </Modal.Header>
        <form onSubmit={saveEdit}>
          <Modal.Body>
            <textarea
              className="form-control mb-3"
              rows={6}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
            />
            <MoodPicker value={editMood} onChange={setEditMood} />
          </Modal.Body>
          <Modal.Footer>
            <button type="button" className="btn btn-outline-secondary" onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-brand px-4" disabled={updating || !editContent.trim()}>
              {updating ? "Saving…" : "Save changes"}
            </button>
          </Modal.Footer>
        </form>
      </Modal>

      <ConfirmDialog
        show={!!deleteTarget}
        title="Delete this entry?"
        message="This reflection will be permanently removed."
        confirmLabel="Delete"
        destructive
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
