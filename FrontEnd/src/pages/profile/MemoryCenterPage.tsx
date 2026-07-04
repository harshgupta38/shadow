import { useMemo, useState } from "react";
import { Modal } from "react-bootstrap";
import { PencilSquare, PlusLg, Stars, Trash3 } from "react-bootstrap-icons";

import {
  api,
  ApiError,
  type MemoryCategory,
  type MemoryCenterEntry,
  type MemoryRefineResponse,
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
const MEMORY_TEXT_REWRITE_THRESHOLD = 15;

function confidencePill(confidence: string): "success" | "info" | "warn" | "muted" {
  if (confidence === "very_high" || confidence === "high") return "success";
  if (confidence === "medium") return "info";
  if (confidence === "low") return "warn";
  return "muted";
}

function characterEditDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;

  const previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;

    for (let j = 1; j <= b.length; j += 1) {
      const up = previous[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + cost,
      );
      diagonal = up;
    }
  }

  return previous[b.length];
}

export function MemoryCenterPage() {
  const toast = useToast();
  const memoryQuery = useAsync(() => api.profile.memoryCenter(), []);

  const [showAddModal, setShowAddModal] = useState(false);
  const [memoryCategory, setMemoryCategory] = useState<MemoryCategory>("other");
  const [memoryText, setMemoryText] = useState("");
  const [addingMemory, setAddingMemory] = useState(false);
  const [refiningMemory, setRefiningMemory] = useState(false);
  const [refinedBaselineText, setRefinedBaselineText] = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingMemoryId, setEditingMemoryId] = useState<number | null>(null);
  const [editingMemoryCategory, setEditingMemoryCategory] = useState<MemoryCategory>("other");
  const [editingMemoryText, setEditingMemoryText] = useState("");
  const [editOriginalText, setEditOriginalText] = useState("");
  const [editRefinedBaselineText, setEditRefinedBaselineText] = useState<string | null>(null);
  const [savingEditedMemory, setSavingEditedMemory] = useState(false);
  const [refiningEditedMemory, setRefiningEditedMemory] = useState(false);
  const [confirmEditTarget, setConfirmEditTarget] = useState<MemoryCenterEntry | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deletingMemory, setDeletingMemory] = useState(false);

  const normalizedModalText = memoryText.trim();
  const currentEditDistance = refinedBaselineText
    ? characterEditDistance(refinedBaselineText, normalizedModalText)
    : 0;
  const requiresRefine = !refinedBaselineText || currentEditDistance > MEMORY_TEXT_REWRITE_THRESHOLD;

  const normalizedEditText = editingMemoryText.trim();
  const editDistanceReference = editRefinedBaselineText ?? editOriginalText;
  const editCurrentDistance = editDistanceReference
    ? characterEditDistance(editDistanceReference, normalizedEditText)
    : 0;
  const editRequiresRefine = editCurrentDistance >= MEMORY_TEXT_REWRITE_THRESHOLD;

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
    if (addingMemory || refiningMemory) return;
    setShowAddModal(false);
    setMemoryText("");
    setMemoryCategory("other");
    setRefinedBaselineText(null);
  }

  async function refineMemoryText(
    text: string,
    category: MemoryCategory,
  ): Promise<MemoryRefineResponse> {
    const result = await api.profile.refineMemoryText({
      category,
      text,
    });
    return {
      ...result,
      refined_text: result.refined_text.trim(),
    };
  }

  async function addMemory() {
    const text = memoryText.trim();
    if (!text) return;

    const editDistance = refinedBaselineText
      ? characterEditDistance(refinedBaselineText, text)
      : 0;
    const shouldRefine = !refinedBaselineText || editDistance > MEMORY_TEXT_REWRITE_THRESHOLD;

    if (shouldRefine) {
      setRefiningMemory(true);
      try {
        const result = await refineMemoryText(text, memoryCategory);
        const refined = result.refined_text || text;

        setMemoryText(refined);
        setRefinedBaselineText(refined);

        if (result.status === "fallback") {
          toast.info(
            result.reason ??
              "Shadow couldn't safely refine this detail, so your original text was kept. You can still edit and save it.",
          );
        } else if (refinedBaselineText) {
          toast.info("Large edits detected. Shadow regenerated the memory understanding. You can save now.");
        } else {
          toast.info("Shadow generated a memory understanding. Review it, then press Save.");
        }
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Couldn't refine this detail.");
      } finally {
        setRefiningMemory(false);
      }
      return;
    }

    setAddingMemory(true);
    try {
      await api.profile.addMemory({
        category: memoryCategory,
        ai_understanding: text,
        source: "manual",
      });
      setMemoryText("");
      setRefinedBaselineText(null);
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

  function resetEditModalState() {
    setShowEditModal(false);
    setEditingMemoryId(null);
    setEditingMemoryCategory("other");
    setEditingMemoryText("");
    setEditOriginalText("");
    setEditRefinedBaselineText(null);
  }

  function closeEditModal() {
    if (savingEditedMemory || refiningEditedMemory) return;
    resetEditModalState();
  }

  function openEditModal(memory: MemoryCenterEntry) {
    setShowEditModal(true);
    setEditingMemoryId(memory.id);
    setEditingMemoryCategory(memory.category);
    setEditingMemoryText(memory.value);
    setEditOriginalText(memory.value.trim());
    setEditRefinedBaselineText(null);
  }

  function requestEditMemory(memory: MemoryCenterEntry) {
    setConfirmEditTarget(memory);
  }

  function confirmEditMemory() {
    if (!confirmEditTarget) return;
    openEditModal(confirmEditTarget);
    setConfirmEditTarget(null);
  }

  async function saveEditedMemory() {
    if (editingMemoryId === null) return;

    const text = editingMemoryText.trim();
    if (!text) return;

    if (editRequiresRefine) {
      setRefiningEditedMemory(true);
      try {
        const result = await refineMemoryText(text, editingMemoryCategory);
        const refined = result.refined_text || text;

        setEditingMemoryText(refined);
        setEditRefinedBaselineText(refined);

        if (result.status === "fallback") {
          toast.info(
            result.reason ??
              "Shadow couldn't safely refine this detail, so your original text was kept. You can still edit and save it.",
          );
        } else if (editRefinedBaselineText) {
          toast.info("Large edits detected. Shadow regenerated the memory understanding. You can save now.");
        } else {
          toast.info("Shadow generated a memory understanding. Review it, then press Save.");
        }
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Couldn't refine this detail.");
      } finally {
        setRefiningEditedMemory(false);
      }
      return;
    }

    setSavingEditedMemory(true);
    try {
      await api.profile.updateMemory(editingMemoryId, {
        ai_understanding: text,
        category: editingMemoryCategory,
      });
      const refreshed = await api.profile.memoryCenter();
      memoryQuery.setData(refreshed);
      resetEditModalState();
      toast.success("Memory updated.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't update memory.");
    } finally {
      setSavingEditedMemory(false);
    }
  }

  async function deleteMemory(memoryId: number) {
    try {
      await api.profile.deleteMemory(memoryId);
      memoryQuery.setData((prev) => (prev ?? []).filter((m) => m.id !== memoryId));
      if (editingMemoryId === memoryId) {
        resetEditModalState();
      }
      toast.success("Memory removed.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't delete memory.");
    }
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

                          <p className="small mb-2" style={{ lineHeight: 1.55 }}>
                            {memory.value}
                          </p>
                          <div className="d-flex align-items-center justify-content-between gap-2">
                            <span className="text-faint" style={{ fontSize: "0.72rem" }}>
                              Used by: {memory.used_by.join(", ")}
                            </span>
                            <div className="d-flex align-items-center gap-1">
                              {memory.editable ? (
                                <>
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
                                </>
                              ) : (
                                <span className="text-faint small">Read only</span>
                              )}
                            </div>
                          </div>
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

      <Modal show={showAddModal} onHide={closeAddModal} centered backdrop="static">
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
            <p className="text-faint small mb-0 mt-2">
              Shadow first generates a memory understanding from your note. Minor edits (up to {MEMORY_TEXT_REWRITE_THRESHOLD} characters) are saved directly.
            </p>
            {refinedBaselineText && (
              <p className={`small mb-0 mt-1 ${requiresRefine ? "text-warning" : "text-faint"}`}>
                {requiresRefine
                  ? `Large edits detected (${currentEditDistance} characters). Click Refine again before saving.`
                  : `Ready to save. Current edits from refined text: ${currentEditDistance} characters.`}
              </p>
            )}
          </div>

          <div>
            <label className="form-label" htmlFor="memory-category">
              Category
            </label>
            <select
              id="memory-category"
              className="form-select"
              value={memoryCategory}
              onChange={(e) => {
                setMemoryCategory(e.target.value as MemoryCategory);
                setRefinedBaselineText(null);
              }}
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
          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={closeAddModal}
            disabled={addingMemory || refiningMemory}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-brand"
            onClick={addMemory}
            disabled={addingMemory || refiningMemory || !memoryText.trim()}
          >
            {addingMemory ? "Saving..." : refiningMemory ? "Refining..." : requiresRefine ? "Refine" : "Save"}
          </button>
        </Modal.Footer>
      </Modal>

      <Modal show={showEditModal} onHide={closeEditModal} centered backdrop="static">
        <Modal.Header closeButton>
          <Modal.Title as="h3" className="h6 fw-bold mb-0">
            Edit detail
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="text-muted-2 small mb-3">
            Update this detail so Shadow can personalize responses more accurately.
          </p>

          <div className="mb-3">
            <label className="form-label" htmlFor="memory-edit-detail-text">
              Details
            </label>
            <textarea
              id="memory-edit-detail-text"
              className="form-control"
              rows={4}
              style={MEMORY_TEXTAREA_STYLE}
              placeholder="Describe a meaningful detail about your preferences, goals, habits, or constraints"
              value={editingMemoryText}
              onChange={(e) => setEditingMemoryText(e.target.value)}
            />
            <p className="text-faint small mb-0 mt-2">
              Small edits (under {MEMORY_TEXT_REWRITE_THRESHOLD} characters) save directly. Bigger edits are refined by Shadow first.
            </p>
            <p className={`small mb-0 mt-1 ${editRequiresRefine ? "text-warning" : "text-faint"}`}>
              {editRequiresRefine
                ? `Large edits detected (${editCurrentDistance} characters). Click Refine before saving.`
                : `Ready to save. Current edits: ${editCurrentDistance} characters.`}
            </p>
          </div>

          <div>
            <label className="form-label" htmlFor="memory-edit-category">
              Category
            </label>
            <select
              id="memory-edit-category"
              className="form-select"
              value={editingMemoryCategory}
              onChange={(e) => {
                setEditingMemoryCategory(e.target.value as MemoryCategory);
                setEditRefinedBaselineText(null);
              }}
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
          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={closeEditModal}
            disabled={savingEditedMemory || refiningEditedMemory}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-brand"
            onClick={saveEditedMemory}
            disabled={savingEditedMemory || refiningEditedMemory || !editingMemoryText.trim()}
          >
            {savingEditedMemory
              ? "Saving..."
              : refiningEditedMemory
                ? "Refining..."
                : editRequiresRefine
                  ? "Refine"
                  : "Save"}
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
