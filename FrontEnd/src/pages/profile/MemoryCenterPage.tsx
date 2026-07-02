import { useMemo, useState, type FormEvent } from "react";
import { PencilSquare, PlusLg, Stars, Trash3 } from "react-bootstrap-icons";

import {
  api,
  ApiError,
  type MemoryCategory,
  type MemoryCenterEntry,
} from "@/api";
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

function confidencePill(confidence: string): "success" | "info" | "warn" | "muted" {
  if (confidence === "very_high" || confidence === "high") return "success";
  if (confidence === "medium") return "info";
  if (confidence === "low") return "warn";
  return "muted";
}

export function MemoryCenterPage() {
  const toast = useToast();
  const memoryQuery = useAsync(() => api.profile.memoryCenter(), []);

  const [memoryCategory, setMemoryCategory] = useState<MemoryCategory>("other");
  const [memoryText, setMemoryText] = useState("");
  const [addingMemory, setAddingMemory] = useState(false);
  const [editingMemoryId, setEditingMemoryId] = useState<number | null>(null);
  const [editingMemoryText, setEditingMemoryText] = useState("");

  const memoryByCategory = useMemo(() => {
    const grouped = new Map<MemoryCategory, MemoryCenterEntry[]>();
    for (const item of memoryQuery.data ?? []) {
      const current = grouped.get(item.category) ?? [];
      current.push(item);
      grouped.set(item.category, current);
    }
    return grouped;
  }, [memoryQuery.data]);

  async function addMemory(event: FormEvent) {
    event.preventDefault();
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
      toast.success("Memory removed.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't delete memory.");
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
    <div className="memory-center-page">
      <PageHeader
        title="AI Memory Center"
        subtitle="Transparent memory cards used across agents."
        icon={<Stars size={20} />}
      />

      <div className="row g-4">
        <div className="col-12">
          <SectionCard title="AI Memory Center" subtitle="Transparent memory cards used across agents.">
            <form onSubmit={addMemory} className="surface-2 p-3 mb-3">
              <div className="row g-2 align-items-end">
                <div className="col-sm-5">
                  <label className="form-label">Category</label>
                  <select
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
                <div className="col-sm-7">
                  <label className="form-label">Memory</label>
                  <input
                    className="form-control"
                    placeholder="Tell Shadow something important to remember"
                    value={memoryText}
                    onChange={(e) => setMemoryText(e.target.value)}
                  />
                </div>
              </div>
              <div className="text-end mt-2">
                <button className="btn btn-soft btn-sm" disabled={addingMemory || !memoryText.trim()}>
                  <PlusLg size={14} className="me-1" /> Add Memory
                </button>
              </div>
            </form>

            {(memoryQuery.data ?? []).length === 0 && (
              <EmptyState
                compact
                icon={<Stars size={22} />}
                title="No memories yet"
                message="Add key preferences so every AI module responds with your context in mind."
              />
            )}

            {(memoryQuery.data ?? []).length > 0 && (
              <div className="d-flex flex-column gap-3" style={{ maxHeight: 560, overflowY: "auto" }}>
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
                                    onClick={() => {
                                      setEditingMemoryId(memory.id);
                                      setEditingMemoryText(memory.value);
                                    }}
                                  >
                                    <PencilSquare size={14} className="me-1" /> Edit
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-ghost btn-sm text-danger"
                                    onClick={() => deleteMemory(memory.id)}
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
    </div>
  );
}
