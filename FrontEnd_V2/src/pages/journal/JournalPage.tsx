import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookHalf, CheckLg, ChevronLeft, ChevronRight, ExclamationCircleFill } from "react-bootstrap-icons";
import { PageHeader } from "@/components/ui/PageHeader/PageHeader";
import { todayIso } from "@/services/date.service";
import { api, ApiError } from "@/api";
import type { JournalEntryResponse, JournalMood } from "@/api/types";
import { MOODS, fmtDisplayDate } from "@/pages/journal/JournalPage.constants";
import "@/pages/journal/JournalPage.scss";

type SaveState = "idle" | "saving" | "saved" | "error";

const DAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const QUILL_MODULES = {
    toolbar: [
        ["bold", "italic", "underline", "strike"],
        [{ list: "ordered" }, { list: "bullet" }],
        ["blockquote"],
        ["clean"],
    ],
};

const QUILL_FORMATS = ["bold", "italic", "underline", "strike", "list", "bullet", "blockquote"];

function computeWeekDates(today: string, offset: number): string[] {
    const todayDate = new Date(today + "T00:00:00");
    const sunday = new Date(todayDate);
    sunday.setDate(todayDate.getDate() - todayDate.getDay() + offset * 7);
    return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(sunday);
        d.setDate(sunday.getDate() + i);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    });
}

// ─── Component ────────────────────────────────────────────────────────────────

export function JournalPage() {
    const TODAY = todayIso();

    const [weekOffset, setWeekOffset]     = useState(0);
    const [selectedDate, setSelectedDate] = useState(TODAY);
    const [entryMap, setEntryMap]         = useState<Map<string, JournalEntryResponse>>(new Map());

    const [mood, setMood]           = useState<JournalMood | null>(null);
    const [text, setText]           = useState("");
    const [saveState, setSaveState] = useState<SaveState>("idle");
    const saveTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
    const savedTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
    const currentDateRef = useRef(selectedDate);
    // Quill fires onChange when value prop changes externally; suppress that save.
    const isSettlingRef  = useRef(false);

    const weekDates = useMemo(() => computeWeekDates(TODAY, weekOffset), [TODAY, weekOffset]);
    const canGoNext = weekOffset < 0;

    // ── Load entries for months visible in current week ───────────────────────

    const loadWeekEntries = useCallback(() => {
        const monthKeys = new Set(weekDates.map(iso => iso.slice(0, 7)));
        for (const ym of monthKeys) {
            const [y, m] = ym.split("-").map(Number);
            void api.journal.getMonthEntries(y, m)
                .then(entries => {
                    setEntryMap(prev => {
                        const next = new Map(prev);
                        for (const e of entries) next.set(e.entry_date, e);
                        return next;
                    });
                })
                .catch(() => {});
        }
    }, [weekDates]);

    useEffect(() => { loadWeekEntries(); }, [loadWeekEntries]);

    // ── Sync editor when selected date changes ────────────────────────────────

    useEffect(() => {
        if (saveTimerRef.current)  clearTimeout(saveTimerRef.current);
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        currentDateRef.current = selectedDate;
        isSettlingRef.current = true;
        const entry = entryMap.get(selectedDate);
        setMood(entry?.mood ?? null);
        setText(entry?.text ?? "");
        setSaveState("idle");
        requestAnimationFrame(() => { isSettlingRef.current = false; });
    }, [selectedDate]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Auto-save ─────────────────────────────────────────────────────────────

    function scheduleSave(targetDate: string, newMood: JournalMood | null, newText: string) {
        if (saveTimerRef.current)  clearTimeout(saveTimerRef.current);
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        setSaveState("saving");
        saveTimerRef.current = setTimeout(() => {
            void api.journal.upsertEntry(targetDate, { mood: newMood, text: newText })
                .then(entry => {
                    if (currentDateRef.current !== targetDate) return;
                    setEntryMap(prev => {
                        const next = new Map(prev);
                        next.set(entry.entry_date, entry);
                        return next;
                    });
                    setSaveState("saved");
                    savedTimerRef.current = setTimeout(() => setSaveState("idle"), 2200);
                })
                .catch(err => {
                    if (currentDateRef.current !== targetDate) return;
                    if (err instanceof ApiError && err.status === 404) { setSaveState("idle"); return; }
                    setSaveState("error");
                    savedTimerRef.current = setTimeout(() => setSaveState("idle"), 3000);
                });
        }, 800);
    }

    function handleMoodClick(m: JournalMood) {
        const next = mood === m ? null : m;
        setMood(next);
        scheduleSave(selectedDate, next, text);
    }

    function handleQuillChange(val: string) {
        setText(val);
        if (!isSettlingRef.current) scheduleSave(selectedDate, mood, val);
    }

    // ── Week navigation ───────────────────────────────────────────────────────

    function prevWeek() {
        const newOffset = weekOffset - 1;
        setWeekOffset(newOffset);
        const dates = computeWeekDates(TODAY, newOffset);
        setSelectedDate(dates[6]);
    }

    function nextWeek() {
        if (!canGoNext) return;
        const newOffset = weekOffset + 1;
        setWeekOffset(newOffset);
        setSelectedDate(newOffset === 0 ? TODAY : computeWeekDates(TODAY, newOffset)[6]);
    }

    function selectDate(iso: string) {
        if (iso > TODAY) return;
        setSelectedDate(iso);
    }

    // ── Render ────────────────────────────────────────────────────────────────

    const isFutureSelected = selectedDate > TODAY;

    return (
        <section className="jnl-page">
            <PageHeader
                title="Journal"
                subtitle="Reflect on your day — thoughts that are written are thoughts that last."
                icon={<BookHalf size={20} />}
            />

            {/* ── Week strip ─────────────────────────────────────────── */}
            <div className="surface jnl-week-card">
                <div className="jnl-week-strip">
                    <button
                        type="button"
                        className="btn btn-ghost btn-icon border-0 jnl-week-nav"
                        onClick={prevWeek}
                        aria-label="Previous week"
                    >
                        <ChevronLeft size={15} />
                    </button>

                    <div className="jnl-week-cells">
                        {weekDates.map((iso, i) => {
                            const day        = parseInt(iso.split("-")[2], 10);
                            const isFuture   = iso > TODAY;
                            const isToday    = iso === TODAY;
                            const isSelected = iso === selectedDate;
                            return (
                                <button
                                    key={iso}
                                    type="button"
                                    disabled={isFuture}
                                    className={[
                                        "jnl-week-cell",
                                        isToday    && "is-today",
                                        isSelected && "is-selected",
                                        isFuture   && "is-future",
                                    ].filter(Boolean).join(" ")}
                                    onClick={() => selectDate(iso)}
                                    aria-label={iso}
                                    aria-pressed={isSelected}
                                >
                                    <span className="jnl-week-abbr">{DAY_ABBR[i]}</span>
                                    <span className="jnl-week-num">{day}</span>
                                </button>
                            );
                        })}
                    </div>

                    <button
                        type="button"
                        className="btn btn-ghost btn-icon border-0 jnl-week-nav"
                        onClick={nextWeek}
                        disabled={!canGoNext}
                        aria-label="Next week"
                    >
                        <ChevronRight size={15} />
                    </button>
                </div>
            </div>

            {/* ── Editor ─────────────────────────────────────────────── */}
            <div className="surface jnl-editor">
                <div className="jnl-editor-head">
                    <span className="jnl-editor-date">{fmtDisplayDate(selectedDate)}</span>
                    <span className="jnl-save-indicator">
                        {saveState === "saving" && <span className="jnl-saving">Saving…</span>}
                        {saveState === "saved"  && <span className="jnl-saved"><CheckLg size={12} /> Saved</span>}
                        {saveState === "error"  && <span className="jnl-save-error"><ExclamationCircleFill size={12} /> Couldn't save</span>}
                    </span>
                </div>

                {isFutureSelected ? (
                    <div className="jnl-future-state">
                        <span className="jnl-future-emoji">🔮</span>
                        <p className="jnl-future-msg">You can't journal a future date.</p>
                        <p className="jnl-future-hint">Come back when the day arrives.</p>
                    </div>
                ) : (
                    <>
                        <ReactQuill
                            className="jnl-quill"
                            theme="snow"
                            value={text}
                            onChange={handleQuillChange}
                            modules={QUILL_MODULES}
                            formats={QUILL_FORMATS}
                            placeholder="What happened today? What's on your mind?"
                        />

                        <div className="jnl-mood-row">
                            <span className="jnl-mood-label-text">How was your day?</span>
                            <div className="jnl-mood-pills">
                                {MOODS.map(m => (
                                    <button
                                        key={m.key}
                                        type="button"
                                        className={`jnl-mood-pill${mood === m.key ? " is-active" : ""}`}
                                        style={{ "--mood-color": m.color } as React.CSSProperties}
                                        onClick={() => handleMoodClick(m.key)}
                                        aria-pressed={mood === m.key}
                                        title={m.label}
                                    >
                                        <span className="jnl-mood-emoji" aria-hidden="true">{m.emoji}</span>
                                        <span className="jnl-mood-pill-label">{m.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </section>
    );
}
