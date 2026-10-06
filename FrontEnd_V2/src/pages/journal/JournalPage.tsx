import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookHalf, CheckLg, ChevronLeft, ChevronRight, ExclamationCircleFill } from "react-bootstrap-icons";
import { PageHeader } from "@/components/ui/PageHeader/PageHeader";
import { todayIso } from "@/services/date.service";
import { api } from "@/api";
import type { JournalEntryResponse, JournalMood } from "@/api/types";
import { MOODS, fmtDisplayDate } from "@/pages/journal/JournalPage.constants";
import { TIMING } from "@/constant/tuning";
import "@/pages/journal/JournalPage.scss";

type SaveState = "idle" | "saving" | "saved" | "error";
type WeekStatus = "loading" | "ready" | "error";
interface PendingEdit { date: string; mood: JournalMood | null; text: string }

// Quill represents an empty document as this markup; store it as an empty string.
function normalizeQuillHtml(html: string): string {
    return html === "<p><br></p>" ? "" : html;
}

const DAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const QUILL_MODULES = {
	toolbar: [
		[{ header: [2, 3, 4, false] }],
		["bold", "italic", "underline"], 
		[{ color: [] }, { background: [] }],
		[{ list: "ordered" }, { list: "bullet" }],
		["blockquote", "code-block"],
		["link"],
		["clean"],
	],
};

const QUILL_FORMATS = ["header", "bold", "italic", "underline", "color", "background", "list", "bullet", "blockquote", "code-block", "link"];

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
    const [weekStatus, setWeekStatus] = useState<Record<string, WeekStatus>>({});
    const saveTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
    const savedTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
    const currentDateRef = useRef(selectedDate);
    // The one edit the user made that hasn't reached the server yet. Only user actions set this.
    const pendingRef     = useRef<PendingEdit | null>(null);
    const entryMapRef    = useRef(entryMap);
    const weekStatusRef  = useRef(weekStatus);
    entryMapRef.current   = entryMap;
    weekStatusRef.current = weekStatus;

    const weekDates = useMemo(() => computeWeekDates(TODAY, weekOffset), [TODAY, weekOffset]);
    const canGoNext = weekOffset < 0;
    const weekStart = weekDates[0];
    const status    = weekStatus[weekStart];
    // The editor is locked until the visible week's entries are known, so a blank editor can
    // never be saved over an entry that simply hasn't arrived yet.
    const isReady   = status === "ready";

    // ── Persist ───────────────────────────────────────────────────────────────

    // Sends the pending user edit immediately. Safe to call with nothing pending.
    function flushSave() {
        if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
        const edit = pendingRef.current;
        if (!edit) return;
        pendingRef.current = null;

        const isCurrent = () => currentDateRef.current === edit.date;
        const isBlank   = edit.mood === null && edit.text === "";
        if (isBlank && !entryMapRef.current.has(edit.date)) {
            if (isCurrent()) setSaveState("idle");
            return;
        }

        void api.journal.upsertEntry(edit.date, { mood: edit.mood, text: edit.text })
            .then(entry => {
                setEntryMap(prev => new Map(prev).set(entry.entry_date, entry));
                if (!isCurrent()) return;
                setSaveState("saved");
                savedTimerRef.current = setTimeout(() => setSaveState("idle"), TIMING.JOURNAL_SAVED_BANNER_MS);
            })
            .catch(() => {
                if (!isCurrent()) return;
                setSaveState("error");
                savedTimerRef.current = setTimeout(() => setSaveState("idle"), TIMING.JOURNAL_ERROR_BANNER_MS);
            });
    }

    function scheduleSave(date: string, newMood: JournalMood | null, newText: string) {
        if (saveTimerRef.current)  clearTimeout(saveTimerRef.current);
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        pendingRef.current = { date, mood: newMood, text: newText };
        setSaveState("saving");
        saveTimerRef.current = setTimeout(flushSave, TIMING.JOURNAL_SAVE_DEBOUNCE_MS);
    }

    // Don't lose an edit made just before leaving the page.
    useEffect(() => () => flushSave(), []); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Load entries for the visible week ─────────────────────────────────────

    const loadWeekEntries = useCallback(() => {
        const start = weekDates[0];
        const end   = weekDates[6];
        if (weekStatusRef.current[start] === "ready") return;

        setWeekStatus(prev => ({ ...prev, [start]: "loading" }));
        void api.journal.getEntries(start, end)
            .then(entries => {
                setEntryMap(prev => {
                    const next = new Map(prev);
                    for (const e of entries) next.set(e.entry_date, e);
                    return next;
                });
                setWeekStatus(prev => ({ ...prev, [start]: "ready" }));
                // The editor was locked while loading, so there are no user edits to protect.
                const entry = entries.find(e => e.entry_date === currentDateRef.current);
                if (entry) {
                    setMood(entry.mood ?? null);
                    setText(entry.text ?? "");
                }
            })
            .catch(() => setWeekStatus(prev => ({ ...prev, [start]: "error" })));
    }, [weekDates]);

    useEffect(() => { loadWeekEntries(); }, [loadWeekEntries]);

    // ── Show the selected date's entry when the selection changes ─────────────

    useEffect(() => {
        flushSave(); // persist anything typed on the previous date before leaving it
        if (savedTimerRef.current) { clearTimeout(savedTimerRef.current); savedTimerRef.current = null; }
        currentDateRef.current = selectedDate;
        const entry = entryMapRef.current.get(selectedDate);
        setMood(entry?.mood ?? null);
        setText(entry?.text ?? "");
        setSaveState("idle");
    }, [selectedDate]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── User actions (the only paths that may save) ───────────────────────────

    function handleMoodClick(m: JournalMood) {
        if (!isReady) return;
        const next = mood === m ? null : m;
        setMood(next);
        scheduleSave(selectedDate, next, normalizeQuillHtml(text));
    }

    // Quill reports programmatic value changes with source "api"; only "user" is a real edit.
    function handleQuillChange(val: string, _delta: unknown, source: string) {
        if (source !== "user") return;
        setText(val);
        scheduleSave(selectedDate, mood, normalizeQuillHtml(val));
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

    // ── Render ────────────────────────────────────────────────────────────────

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
                                    onClick={() => setSelectedDate(iso)}
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
                        {status === "error" && (
                            <span className="jnl-save-error">
                                <ExclamationCircleFill size={12} /> Couldn't load entries{" "}
                                <button type="button" className="btn btn-link btn-sm p-0 align-baseline" onClick={loadWeekEntries}>Retry</button>
                            </span>
                        )}
                        {status !== "error" && !isReady && <span className="jnl-saving">Loading…</span>}
                        {saveState === "saving" && <span className="jnl-saving">Saving…</span>}
                        {saveState === "saved"  && <span className="jnl-saved"><CheckLg size={12} /> Saved</span>}
                        {saveState === "error"  && <span className="jnl-save-error"><ExclamationCircleFill size={12} /> Couldn't save</span>}
                    </span>
                </div>

                <ReactQuill
                    className="jnl-quill"
                    theme="snow"
                    value={text}
                    onChange={handleQuillChange}
                    readOnly={!isReady}
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
                                disabled={!isReady}
                                aria-pressed={mood === m.key}
                                title={m.label}
                            >
                                <span className="jnl-mood-emoji" aria-hidden="true">{m.emoji}</span>
                                <span className="jnl-mood-pill-label">{m.label}</span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}
