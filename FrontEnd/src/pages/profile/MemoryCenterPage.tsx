import { useMemo, useState } from "react";
import { Modal } from "react-bootstrap";
import { PencilSquare, PlusLg, Stars, Trash3 } from "react-bootstrap-icons";

import {
  api,
  ApiError,
  type MemoryCategory,
  type MemoryCenterEntry,
} from "@/api";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pill } from "@/components/ui/Pill";
import { SectionCard } from "@/components/ui/SectionCard";
import { useToast } from "@/context/ToastContext";
import { useAsync } from "@/hooks/useAsync";
import { relativeTime } from "@/lib/format";
import { MEMORY_CATEGORY_LABEL, MEMORY_SOURCE_LABEL } from "@/lib/labels";

const MEMORY_CATEGORIES = Object.keys(MEMORY_CATEGORY_LABEL) as MemoryCategory[];
const MEMORY_TEXTAREA_STYLE = { minHeight: "110px", maxHeight: "220px", resize: "vertical" } as const;

function confidencePill(confidence: string): "success" | "info" | "warn" | "muted" {
  if (confidence === "very_high" || confidence === "high") return "success";
  if (confidence === "medium") return "info";
  if (confidence === "low") return "warn";
  return "muted";
}

export function MemoryCenterPage() {
  const toast = useToast();
  const memoryQuery = useAsync(() => api.profile.memoryCenter(), []);

  const [showAddModal, setShowAddModal] = useState(false);
  const [memoryCategory, setMemoryCategory] = useState<MemoryCategory>("other");
  const [memoryText, setMemoryText] = useState("");
  const [addingMemory, setAddingMemory] = useState(false);
  const [editingMemoryId, setEditingMemoryId] = useState<number | null>(null);
  const [editingMemoryText, setEditingMemoryText] = useState("");
  const [confirmEditTarget, setConfirmEditTarget] = useState<MemoryCenterEntry | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deletingMemory, setDeletingMemory] = useState(false);

  const memoryByCategory = useMemo(() => {
    const grouped = new Map<MemoryCategory, MemoryCenterEntry[]>();
    for (const item of memoryQuery.data ?? []) {
      const current = grouped.get(item.category) ?? [];
      current.push(item);
      grouped.set(item.category, current);
    }
    return grouped;
  }, [memoryQuery.data]);

  function closeAddModal() {
    if (addingMemory) return;
    setShowAddModal(false);
    setMemoryText("");
    setMemoryCategory("other");
  }

  async function addMemory() {
    if (!memoryText.trim()) return;
    setAddingMemory(true);
    try {
      await api.profile.addMemory({
        category: memoryCategory,
        ai_understanding: memoryText.trim(),
        source: "manual",
      });
      setMemoryText("");
      const refreshed = await api.profile.memoryCenter();
      memoryQuery.setData(refreshed);
      setShowAddModal(false);
      toast.success("Added to Shadow memory.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't add memory.");
    } finally {
      setAddingMemory(false);
    }
  }

  async function saveMemoryEdit(memoryId: number) {
    if (!editingMemoryText.trim()) return;
    try {
      await api.profile.updateMemory(memoryId, { ai_understanding: editingMemoryText.trim() });
      const refreshed = await api.profile.memoryCenter();
      memoryQuery.setData(refreshed);
      setEditingMemoryId(null);
      setEditingMemoryText("");
      toast.success("Memory updated.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't update memory.");
    }
  }

  async function deleteMemory(memoryId: number) {
    try {
      await api.profile.deleteMemory(memoryId);
      memoryQuery.setData((prev) => (prev ?? []).filter((m) => m.id !== memoryId));
      if (editingMemoryId === memoryId) {
        setEditingMemoryId(null);
        setEditingMemoryText("");
      }
      toast.success("Memory removed.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't delete memory.");
    }
  }

  function requestEditMemory(memory: MemoryCenterEntry) {
    setConfirmEditTarget(memory);
  }

  function confirmEditMemory() {
    if (!confirmEditTarget) return;
    setEditingMemoryId(confirmEditTarget.id);
    setEditingMemoryText(confirmEditTarget.value);
    setConfirmEditTarget(null);
  }

  async function confirmDeleteMemory() {
    if (confirmDeleteId === null) return;
    setDeletingMemory(true);
    try {
      await deleteMemory(confirmDeleteId);
      setConfirmDeleteId(null);
    } finally {
      setDeletingMemory(false);
    }
  }

  if (memoryQuery.loading) return <LoadingState label="Loading memory center..." />;

  if (memoryQuery.error) {
    return (
      <EmptyState
        title="Couldn't load memory center"
        message={memoryQuery.error}
        action={
          <button className="btn btn-brand" onClick={memoryQuery.reload}>
            Retry
          </button>
        }
      />
    );
  }

  return (
    <div className="memory-center-page page-fill-height">
      <PageHeader
        title="Your Information"
        subtitle="What Shadow knows about you. This information is used to personalize responses."
        icon={<Stars size={20} />}
      />

      <div className="row g-4 flex-grow-1" style={{ minHeight: 0 }}>
        <div className="col-12 d-flex flex-column" style={{ minHeight: 0 }}>
          <SectionCard
            title="Your Information"
            subtitle="What Shadow knows about you. This information is used to personalize responses."
            className="h-100 d-flex flex-column"
            bodyClassName="d-flex flex-column flex-grow-1"
            actions={
              <button
                type="button"
                className="btn btn-soft btn-sm text-nowrap d-inline-flex align-items-center gap-1 memory-add-btn"
                onClick={() => setShowAddModal(true)}
                aria-label="Add more details"
              >
                <span className="d-none d-lg-inline-flex align-items-center memory-add-btn-icon" aria-hidden="true">
                  <PlusLg size={13} />
                </span>
                <span className="d-none d-lg-inline">Add more details</span>
                <span className="d-lg-none">Add details</span>
              </button>
            }
          >
            {(memoryQuery.data ?? []).length === 0 && (
              <div className="d-flex align-items-center justify-content-center flex-grow-1">
                <EmptyState
                  compact
                  icon={<Stars size={22} />}
                  title="No memories yet"
                  message="Add key preferences so every AI module responds with your context in mind."
                />
              </div>
            )}

            {(memoryQuery.data ?? []).length > 0 && (
              <div className="d-flex flex-column gap-3 flex-grow-1" style={{ minHeight: 0, overflowY: "auto" }}>
                {Array.from(memoryByCategory.entries()).map(([category, entries]) => (
                  <div key={category}>
                    <div
                      className="small fw-semibold text-faint mb-2 text-uppercase"
                      style={{ letterSpacing: "0.04em" }}
                    >
                      {MEMORY_CATEGORY_LABEL[category]}
                    </div>
                    <div className="d-flex flex-column gap-2">
                      {entries.map((memory) => (
                        <div key={memory.id} className="surface-2 p-3">
                          <div className="d-flex align-items-center gap-2 flex-wrap mb-2">
                            <Pill variant="brand">{MEMORY_SOURCE_LABEL[memory.source]}</Pill>
                            <Pill variant={confidencePill(memory.confidence)}>
                              Confidence: {memory.confidence.replace("_", " ")}
                            </Pill>
                            <span className="text-faint small ms-auto">{relativeTime(memory.updated_at)}</span>
                          </div>

                          {editingMemoryId === memory.id ? (
                            <div className="d-flex flex-column gap-2">
                              <textarea
                                className="form-control"
                                rows={3}
                                style={MEMORY_TEXTAREA_STYLE}
                                value={editingMemoryText}
                                onChange={(e) => setEditingMemoryText(e.target.value)}
                              />
                              <div className="d-flex gap-2">
                                <button
                                  type="button"
                                  className="btn btn-soft btn-sm"
                                  onClick={() => saveMemoryEdit(memory.id)}
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-sm"
                                  onClick={() => {
                                    setEditingMemoryId(null);
                                    setEditingMemoryText("");
                                  }}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <p className="small mb-2" style={{ lineHeight: 1.55 }}>
                                {memory.value}
                              </p>
                              <div className="d-flex align-items-center justify-content-between gap-2">
                                <span className="text-faint" style={{ fontSize: "0.72rem" }}>
                                  Used by: {memory.used_by.join(", ")}
                                </span>
                                <div className="d-flex align-items-center gap-1">
                                  <button
                                    type="button"
                                    className="btn btn-ghost btn-sm"
                                    onClick={() => requestEditMemory(memory)}
                                  >
                                    <PencilSquare size={14} className="me-1" /> Edit
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-ghost btn-sm text-danger"
                                    onClick={() => setConfirmDeleteId(memory.id)}
                                  >
                                    <Trash3 size={14} className="me-1" /> Delete
                                  </button>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      </div>

      <Modal show={showAddModal} onHide={closeAddModal} centered>
        <Modal.Header closeButton>
          <Modal.Title as="h3" className="h6 fw-bold mb-0">
            What extra details would you like to add?
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="text-muted-2 small mb-3">
            The more detailed your answer will be, the better Shadow can understand you and help with your goals.
          </p>

          <div className="mb-3">
            <label className="form-label" htmlFor="memory-detail-text">
              Details
            </label>
            <textarea
              id="memory-detail-text"
              className="form-control"
              rows={4}
              style={MEMORY_TEXTAREA_STYLE}
              placeholder="Describe a meaningful detail about your preferences, goals, habits, or constraints"
              value={memoryText}
              onChange={(e) => setMemoryText(e.target.value)}
            />
          </div>

          <div>
            <label className="form-label" htmlFor="memory-category">
              Category
            </label>
            <select
              id="memory-category"
              className="form-select"
              value={memoryCategory}
              onChange={(e) => setMemoryCategory(e.target.value as MemoryCategory)}
            >
              {MEMORY_CATEGORIES.map((c) => (
                <option value={c} key={c}>
                  {MEMORY_CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <button type="button" className="btn btn-outline-secondary" onClick={closeAddModal} disabled={addingMemory}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-brand"
            onClick={addMemory}
            disabled={addingMemory || !memoryText.trim()}
          >
            {addingMemory ? "Saving..." : "Save"}
          </button>
        </Modal.Footer>
      </Modal>

      <ConfirmDialog
        show={!!confirmEditTarget}
        title="Edit this detail?"
        message="These details guide Shadow's personalization. Changing them can affect your experience."
        confirmLabel="Continue"
        onConfirm={confirmEditMemory}
        onCancel={() => setConfirmEditTarget(null)}
      />

      <ConfirmDialog
        show={confirmDeleteId !== null}
        title="Delete this detail?"
        message="This will remove the detail from your profile memory and may affect personalized responses."
        confirmLabel="Delete detail"
        destructive
        busy={deletingMemory}
        onConfirm={confirmDeleteMemory}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}
