import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookHalf, CalendarCheck, CheckLg, ChevronLeft, ChevronRight, ExclamationCircleFill } from "react-bootstrap-icons";
import { PageHeader } from "@/components/ui/PageHeader/PageHeader";
import { monthOf, todayIso } from "@/services/date.service";
import { api } from "@/api";
import { useWeekStart } from "@/context/PlannerContext";
import type { JournalEntryResponse, JournalMood } from "@/api/types";
import { MOODS, computeWeekDates, fmtDisplayDate, weekOffsetOf } from "@/pages/journal/JournalPage.constants";
import { JournalTimeline } from "@/pages/journal/JournalTimeline/JournalTimeline";
import { JournalCountdowns } from "@/pages/journal/JournalCountdowns/JournalCountdowns";
import { useCountdowns } from "@/pages/journal/JournalCountdowns/useCountdowns";
import { colorCss } from "@/pages/journal/JournalCountdowns/JournalCountdowns.constants";
import { TIMING } from "@/constant/tuning";
import "@/pages/journal/JournalPage.scss";

type SaveState = "idle" | "saving" | "saved" | "error";
type WeekStatus = "loading" | "ready" | "error";
interface PendingEdit { date: string; mood: JournalMood | null; text: string; countdownIds: number[] }

// Quill keeps empty-but-formatted markup (<p><br></p>, <h2><br></h2>, an empty list...) when the
// text is cleared. Anything without visible text is stored as an empty string.
function normalizeQuillHtml(html: string): string {
    const visibleText = html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
    return visibleText === "" ? "" : html;
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

function dayAbbr(iso: string): string {
    return DAY_ABBR[new Date(iso + "T00:00:00").getDay()];
}

// ─── Component ────────────────────────────────────────────────────────────────

export function JournalPage() {
    const TODAY = todayIso();
    const weekStartsOn = useWeekStart();

    const [weekOffset, setWeekOffset]     = useState(0);
    const [selectedDate, setSelectedDate] = useState(TODAY);
    // The timeline's month. It follows the selected date, and the timeline's own arrows can move it away.
    const [viewMonth, setViewMonth]       = useState(monthOf(TODAY));
    // The entry the server confirmed last, handed to the timeline so it updates as the user writes.
    const [savedEntry, setSavedEntry]     = useState<JournalEntryResponse | null>(null);

    const [mood, setMood]           = useState<JournalMood | null>(null);
    const [text, setText]           = useState("");
    // The countdowns the open day is a note for.
    const [countdownIds, setCountdownIds] = useState<number[]>([]);
    const { countdowns, status: countdownStatus, reload: reloadCountdowns } = useCountdowns();
    const [saveState, setSaveState] = useState<SaveState>("idle");
    const [weekStatus, setWeekStatus] = useState<Record<string, WeekStatus>>({});
    const saveTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
    const savedTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
    const currentDateRef = useRef(selectedDate);
    // The one edit the user made that hasn't reached the server yet. Only user actions set this.
    const pendingRef     = useRef<PendingEdit | null>(null);
    // Cache of every loaded entry. Nothing renders from it directly, so it needn't be state.
    const entryMapRef    = useRef(new Map<string, JournalEntryResponse>());
    const weekStatusRef  = useRef(weekStatus);
    const weekCardRef    = useRef<HTMLDivElement>(null);
    const editorRef      = useRef<HTMLDivElement>(null);
    const quillRef       = useRef<ReactQuill>(null);
    weekStatusRef.current = weekStatus;

    const weekDates = useMemo(() => computeWeekDates(TODAY, weekOffset, weekStartsOn), [TODAY, weekOffset, weekStartsOn]);
    const canGoNext = weekOffset < 0;
    const status    = weekStatus[weekDates[0]];
    // The editor is locked until the visible week's entries are known, so a blank editor can
    // never be saved over an entry that simply hasn't arrived yet.
    const isReady   = status === "ready";
    // Active countdowns can be picked; a finished one stays on the days that were already tagged to it.
    const tagCandidates = useMemo(
        () => countdowns.filter(c => c.status === "active" || countdownIds.includes(c.id)),
        [countdowns, countdownIds],
    );

    // ── Persist ───────────────────────────────────────────────────────────────

    // Sends the pending user edit immediately. Safe to call with nothing pending.
    function flushSave() {
        if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
        const edit = pendingRef.current;
        if (!edit) return;
        pendingRef.current = null;

        const isCurrent = () => currentDateRef.current === edit.date;
        const isBlank   = edit.mood === null && edit.text === "" && edit.countdownIds.length === 0;
        if (isBlank && !entryMapRef.current.has(edit.date)) {
            if (isCurrent()) setSaveState("idle");
            return;
        }

        const hadTags = (entryMapRef.current.get(edit.date)?.countdown_ids.length ?? 0) > 0;
        void api.journal.upsertEntry(edit.date, { mood: edit.mood, text: edit.text, countdown_ids: edit.countdownIds })
            .then(entry => {
                entryMapRef.current.set(entry.entry_date, entry);
                setSavedEntry(entry);
                // The cards count their notes, so they follow a day being tagged or untagged.
                if (hadTags || entry.countdown_ids.length > 0) void reloadCountdowns();
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

    function scheduleSave(date: string, newMood: JournalMood | null, newText: string, newCountdownIds: number[]) {
        if (saveTimerRef.current)  clearTimeout(saveTimerRef.current);
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        pendingRef.current = { date, mood: newMood, text: newText, countdownIds: newCountdownIds };
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
                for (const e of entries) entryMapRef.current.set(e.entry_date, e);
                setWeekStatus(prev => ({ ...prev, [start]: "ready" }));
                // The editor was locked while loading, so there are no user edits to protect.
                const entry = entries.find(e => e.entry_date === currentDateRef.current);
                if (entry) {
                    setMood(entry.mood ?? null);
                    setText(entry.text ?? "");
                    setCountdownIds(entry.countdown_ids ?? []);
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
        setCountdownIds(entry?.countdown_ids ?? []);
        setSaveState("idle");
        setViewMonth(monthOf(selectedDate));
    }, [selectedDate]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── User actions (the only paths that may save) ───────────────────────────

    function handleMoodClick(m: JournalMood) {
        if (!isReady) return;
        const next = mood === m ? null : m;
        setMood(next);
        scheduleSave(selectedDate, next, normalizeQuillHtml(text), countdownIds);
    }

    function handleCountdownToggle(id: number) {
        if (!isReady) return;
        const next = countdownIds.includes(id) ? countdownIds.filter(x => x !== id) : [...countdownIds, id];
        setCountdownIds(next);
        scheduleSave(selectedDate, mood, normalizeQuillHtml(text), next);
    }

    // "Add a note" on a countdown card: the open day becomes a note for it, and the cursor is in the editor ready to write.
    function writeNoteFor(id: number) {
        if (!isReady) return;
        if (!countdownIds.includes(id)) handleCountdownToggle(id);
        editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        quillRef.current?.focus();
    }

    // Quill reports programmatic value changes with source "api"; only "user" is a real edit.
    function handleQuillChange(val: string, _delta: unknown, source: string) {
        if (source !== "user") return;
        setText(val);
        scheduleSave(selectedDate, mood, normalizeQuillHtml(val), countdownIds);
    }

    // Opens a day picked from the timeline: the week strip moves to its week and the editor loads it.
    function openEntry(date: string) {
        setWeekOffset(weekOffsetOf(TODAY, date, weekStartsOn));
        setSelectedDate(date);
        weekCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    // ── Week navigation ───────────────────────────────────────────────────────

    function prevWeek() {
        const newOffset = weekOffset - 1;
        setWeekOffset(newOffset);
        const dates = computeWeekDates(TODAY, newOffset, weekStartsOn);
        setSelectedDate(dates[6]);
    }

    function goToToday() {
        setWeekOffset(0);
        setSelectedDate(TODAY);
    }

    function nextWeek() {
        if (!canGoNext) return;
        const newOffset = weekOffset + 1;
        setWeekOffset(newOffset);
        setSelectedDate(newOffset === 0 ? TODAY : computeWeekDates(TODAY, newOffset, weekStartsOn)[6]);
    }

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <section className="jnl-page">
            <PageHeader
                title="Journal"
                subtitle="Reflect on your day — thoughts that are written are thoughts that last."
                icon={<BookHalf size={20} />}
                actions={weekOffset === 0 ? [] : [{
                    key: "today",
                    label: "Today",
                    icon: <CalendarCheck size={14} />,
                    onClick: goToToday,
                    tone: "soft",
                }]}
            />

            {/* ── Countdowns ─────────────────────────────────────────── */}
            <JournalCountdowns
                countdowns={countdowns}
                status={countdownStatus}
                reload={reloadCountdowns}
                taggedIds={countdownIds}
                onWriteNote={writeNoteFor}
                onOpenNote={openEntry}
            />

            {/* ── Week strip ─────────────────────────────────────────── */}
            <div className="surface jnl-week-card" ref={weekCardRef}>
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
                        {weekDates.map(iso => {
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
                                    <span className="jnl-week-abbr">{dayAbbr(iso)}</span>
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
            <div className="surface jnl-editor mt-3" ref={editorRef}>
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
                    ref={quillRef}
                    className="jnl-quill"
                    theme="snow"
                    value={text}
                    onChange={handleQuillChange}
                    readOnly={!isReady}
                    modules={QUILL_MODULES}
                    formats={QUILL_FORMATS}
                    placeholder="What happened today? What's on your mind?"
                />

                {tagCandidates.length > 0 && (
                    <div className="cd-tag-row">
                        <span className="cd-tag-label">This day is a note for</span>
                        <div className="cd-tag-chips">
                            {tagCandidates.map(c => (
                                <button
                                    key={c.id}
                                    type="button"
                                    className={`cd-tag-chip${countdownIds.includes(c.id) ? " is-on" : ""}`}
                                    style={{ "--cd-color": colorCss(c.color) } as React.CSSProperties}
                                    onClick={() => handleCountdownToggle(c.id)}
                                    disabled={!isReady}
                                    aria-pressed={countdownIds.includes(c.id)}
                                    title={countdownIds.includes(c.id) ? `Remove from ${c.title}` : `Add to ${c.title}`}
                                >
                                    <span aria-hidden="true">{c.emoji}</span>
                                    <span>{c.title}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

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

            {/* ── Month timeline ─────────────────────────────────────── */}
            <JournalTimeline
                month={viewMonth}
                selectedDate={selectedDate}
                savedEntry={savedEntry}
                countdowns={countdowns}
                onChangeMonth={setViewMonth}
                onOpenEntry={openEntry}
            />
        </section>
    );
}
