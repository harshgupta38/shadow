import { useMemo, useState } from "react";
import { CheckLg, ChevronDown, Plus } from "react-bootstrap-icons";
import { api } from "@/api";
import type { CountdownDetailResponse, CountdownResponse } from "@/api/types";
import { CountdownCard } from "@/pages/journal/JournalCountdowns/CountdownCard";
import { CountdownDetailDialog } from "@/pages/journal/JournalCountdowns/CountdownDetailDialog";
import { CountdownFormDialog } from "@/pages/journal/JournalCountdowns/CountdownFormDialog";
import { MAX_ACTIVE_COUNTDOWNS, colorCss } from "@/pages/journal/JournalCountdowns/JournalCountdowns.constants";
import "@/pages/journal/JournalCountdowns/JournalCountdowns.scss";

interface JournalCountdownsProps {
    countdowns: CountdownResponse[];
    status: "loading" | "ready" | "error";
    reload: () => Promise<void>;
    /** The countdowns the journal day open in the editor is already a note for. */
    taggedIds: number[];
    onWriteNote: (countdownId: number) => void;
    onOpenNote: (date: string) => void;
}

interface FormState {
    countdown: CountdownResponse | null;
    /** The detail view to come back to when the form closes. */
    returnTo: number | null;
}

export function JournalCountdowns({ countdowns, status, reload, taggedIds, onWriteNote, onOpenNote }: JournalCountdownsProps) {
    const [detailId, setDetailId] = useState<number | null>(null);
    const [form, setForm] = useState<FormState | null>(null);
    const [busyId, setBusyId] = useState<number | null>(null);
    const [showAchieved, setShowAchieved] = useState(false);

    const active = useMemo(() => countdowns.filter(c => c.status === "active"), [countdowns]);
    const achieved = useMemo(() => countdowns.filter(c => c.status === "achieved"), [countdowns]);
    const atLimit = active.length >= MAX_ACTIVE_COUNTDOWNS;

    async function markAchieved(countdown: CountdownResponse) {
        setBusyId(countdown.id);
        try {
            await api.countdowns.update(countdown.id, { status: "achieved" });
            await reload();
        } finally {
            setBusyId(null);
        }
    }

    function closeForm() {
        const back = form?.returnTo ?? null;
        setForm(null);
        if (back !== null) setDetailId(back);
    }

    function handleSaved(saved: CountdownDetailResponse) {
        void reload();
        const back = form?.returnTo ?? null;
        setForm(null);
        // A new countdown opens straight away so the next step (a task, a note) is one click; an edit returns to where it came from.
        setDetailId(back !== null ? back : saved.id);
    }

    function writeNote(id: number) {
        setDetailId(null);
        onWriteNote(id);
    }

    function openNote(date: string) {
        setDetailId(null);
        onOpenNote(date);
    }

    return (
        <section className="cd-section" aria-label="Countdowns">
            {status === "ready" && countdowns.length === 0 ? (
                <button type="button" className="cd-empty" onClick={() => setForm({ countdown: null, returnTo: null })}>
                    <span className="cd-empty-icon" aria-hidden="true">⏳</span>
                    <span className="cd-empty-text">
                        <strong>Counting down to something?</strong> A trip, an exam, a big day. Watch it get closer, and keep notes and tasks along the way.
                    </span>
                    <span className="cd-empty-cta"><Plus size={14} /> New countdown</span>
                </button>
            ) : (
                <>
                    <div className="cd-section-head">
                        <h2 className="cd-section-title">Countdowns</h2>
                        {status === "ready" && (
                            <button
                                type="button"
                                className="btn btn-ghost btn-sm cd-section-new"
                                onClick={() => setForm({ countdown: null, returnTo: null })}
                                disabled={atLimit}
                                title={atLimit ? `You can count down to ${MAX_ACTIVE_COUNTDOWNS} things at once` : "Add a countdown"}
                            >
                                <Plus size={15} /> New
                            </button>
                        )}
                    </div>

                    {status === "loading" && <div className="cd-skeleton" aria-hidden="true"><span /><span /><span /></div>}
                    {status === "error" && (
                        <p className="cd-note-line">
                            Couldn't load your countdowns{" "}
                            <button type="button" className="btn btn-link btn-sm p-0 align-baseline" onClick={() => void reload()}>Retry</button>
                        </p>
                    )}

                    {active.length > 0 && (
                        <div className="cd-strip">
                            {active.map(c => (
                                <CountdownCard
                                    key={c.id}
                                    countdown={c}
                                    noted={taggedIds.includes(c.id)}
                                    busy={busyId === c.id}
                                    onOpen={() => setDetailId(c.id)}
                                    onWriteNote={() => onWriteNote(c.id)}
                                    onMarkAchieved={() => void markAchieved(c)}
                                />
                            ))}
                        </div>
                    )}

                    {achieved.length > 0 && (
                        <div className="cd-achieved">
                            <button type="button" className="cd-achieved-toggle" onClick={() => setShowAchieved(v => !v)} aria-expanded={showAchieved}>
                                <CheckLg size={12} /> Achieved <span className="cd-achieved-count">{achieved.length}</span>
                                <ChevronDown size={12} className={showAchieved ? "is-open" : ""} />
                            </button>
                            {showAchieved && (
                                <div className="cd-achieved-list">
                                    {achieved.map(c => (
                                        <button
                                            key={c.id}
                                            type="button"
                                            className="cd-achieved-chip"
                                            style={{ "--cd-color": colorCss(c.color) } as React.CSSProperties}
                                            onClick={() => setDetailId(c.id)}
                                        >
                                            <span aria-hidden="true">{c.emoji}</span> {c.title}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}

            <CountdownDetailDialog
                countdownId={detailId}
                onChanged={() => void reload()}
                onClose={() => setDetailId(null)}
                onEdit={detail => { setDetailId(null); setForm({ countdown: detail, returnTo: detail.id }); }}
                onDeleted={() => { setDetailId(null); void reload(); }}
                onOpenNote={openNote}
                onWriteNote={writeNote}
            />

            <CountdownFormDialog show={form !== null} countdown={form?.countdown ?? null} onSaved={handleSaved} onCancel={closeForm} />
        </section>
    );
}
