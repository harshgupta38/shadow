import { useEffect, useMemo, useState } from "react";
import { Modal } from "react-bootstrap";
import { ChevronDown } from "react-bootstrap-icons";
import { api, ApiError } from "@/api";
import type { CountdownColor, CountdownDetailResponse, CountdownResponse } from "@/api/types";
import { useDateFormat } from "@/context/PlannerContext";
import { formatDisplayDate, todayIso } from "@/services/date.service";
import { CountdownDateField } from "@/pages/journal/JournalCountdowns/CountdownDateField";
import { CountdownRing } from "@/pages/journal/JournalCountdowns/CountdownRing";
import {
    COUNTDOWN_COLORS,
    COUNTDOWN_EMOJIS,
    DEFAULT_EMOJI,
    QUICK_TARGETS,
    addMonths,
    colorCss,
    previewTiming,
    ringDisplay,
} from "@/pages/journal/JournalCountdowns/JournalCountdowns.constants";

const NOTE_MAX = 500;
const TITLE_MAX = 120;

interface CountdownFormDialogProps {
    show: boolean;
    /** The countdown being edited. Empty means a new one. */
    countdown: CountdownResponse | null;
    onSaved: (countdown: CountdownDetailResponse) => void;
    onCancel: () => void;
}

export function CountdownFormDialog({ show, countdown, onSaved, onCancel }: CountdownFormDialogProps) {
    const dateFormat = useDateFormat();
    const today = todayIso();
    const [title, setTitle] = useState("");
    const [targetDate, setTargetDate] = useState("");
    const [startDate, setStartDate] = useState("");
    const [showStart, setShowStart] = useState(false);
    const [emoji, setEmoji] = useState(DEFAULT_EMOJI);
    const [showEmojis, setShowEmojis] = useState(false);
    const [color, setColor] = useState<CountdownColor>("brand");
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

    useEffect(() => {
        if (!show) return;
        setTitle(countdown?.title ?? "");
        setTargetDate(countdown?.target_date ?? "");
        setStartDate(countdown?.start_date ?? "");
        setShowStart(Boolean(countdown && countdown.start_date < today));
        setEmoji(countdown?.emoji ?? DEFAULT_EMOJI);
        setShowEmojis(false);
        setColor(countdown?.color ?? "brand");
        setNote(countdown?.note ?? "");
        setBusy(false);
        setError(null);
        setFieldErrors({});
    }, [show, countdown, today]);

    const editing = countdown !== null;
    const finished = editing && countdown.status === "achieved";
    const since = startDate || today;
    const timing = useMemo(
        () => (targetDate ? previewTiming(since, targetDate, today) : null),
        [since, targetDate, today],
    );
    const passed = timing !== null && timing.daysLeft < 0 && !finished;
    const canSave = title.trim() !== "" && targetDate !== "" && !passed && !busy;
    const ring = timing ? ringDisplay(timing.daysLeft) : { value: "–", caption: "" };

    let dateHint = "Pick the day you're counting to, or tap one of these.";
    if (timing) {
        if (timing.daysLeft > 1) dateHint = `${timing.daysLeft} days from today`;
        else if (timing.daysLeft === 1) dateHint = "Tomorrow";
        else if (timing.daysLeft === 0) dateHint = "That's today";
        else dateHint = finished ? `${-timing.daysLeft} days ago` : "That date has already passed";
    }

    async function submit() {
        if (!canSave) return;
        setBusy(true);
        setError(null);
        setFieldErrors({});
        try {
            const body = {
                title: title.trim(),
                target_date: targetDate,
                emoji,
                color,
                note: note.trim() === "" ? null : note.trim(),
                ...(startDate ? { start_date: startDate } : {}),
            };
            const saved = editing ? await api.countdowns.update(countdown.id, body) : await api.countdowns.create(body);
            onSaved(saved);
        } catch (e) {
            const apiError = e instanceof ApiError ? e : null;
            setFieldErrors(apiError?.fieldErrors ?? {});
            setError(apiError?.fieldErrors && Object.keys(apiError.fieldErrors).length > 0 ? null : (apiError?.message ?? "Couldn't save the countdown."));
            setBusy(false);
        }
    }

    return (
        <Modal show={show} onHide={busy ? undefined : onCancel} centered backdrop="static" dialogClassName="cd-form-dialog">
            <Modal.Body className="p-4" style={{ "--cd-color": colorCss(color) } as React.CSSProperties}>
                <h2 className="h5 fw-bold mb-3">{editing ? "Edit countdown" : "New countdown"}</h2>

                {/* A live preview of the card, so you see what you are making */}
                <div className="cd-form-preview" aria-hidden="true">
                    <CountdownRing
                        percent={timing?.progress ?? 0}
                        value={ring.value}
                        caption={ring.caption}
                        ariaLabel="Preview"
                    />
                    <div className="cd-form-preview-body">
                        <div className="cd-form-preview-title">
                            <span>{emoji}</span>
                            <span className={title.trim() ? "" : "is-placeholder"}>{title.trim() || "Your countdown"}</span>
                        </div>
                        <div className="cd-form-preview-date">{targetDate ? formatDisplayDate(targetDate, dateFormat) : "No date yet"}</div>
                    </div>
                </div>

                <label htmlFor="cd-title" className="cd-form-label">What are you counting down to?</label>
                <div className="cd-form-title-row">
                    <button
                        type="button"
                        className={`cd-form-emoji-btn${showEmojis ? " is-open" : ""}`}
                        onClick={() => setShowEmojis(v => !v)}
                        aria-expanded={showEmojis}
                        aria-label="Choose an icon"
                        title="Choose an icon"
                    >
                        <span aria-hidden="true">{emoji}</span>
                        <ChevronDown size={10} aria-hidden="true" />
                    </button>
                    <input
                        id="cd-title"
                        className={`form-control${fieldErrors.title ? " is-invalid" : ""}`}
                        value={title}
                        maxLength={TITLE_MAX}
                        placeholder="Trip to Japan"
                        autoFocus
                        onChange={e => setTitle(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") void submit(); }}
                    />
                </div>
                {fieldErrors.title && <div className="cd-form-error">{fieldErrors.title}</div>}
                {showEmojis && (
                    <div className="cd-form-emojis" role="radiogroup" aria-label="Icon">
                        {COUNTDOWN_EMOJIS.map(e => (
                            <button
                                key={e}
                                type="button"
                                role="radio"
                                aria-checked={emoji === e}
                                className={`cd-form-emoji${emoji === e ? " is-on" : ""}`}
                                onClick={() => { setEmoji(e); setShowEmojis(false); }}
                            >{e}</button>
                        ))}
                    </div>
                )}

                <label htmlFor="cd-date" className="cd-form-label">When is it?</label>
                <CountdownDateField
                    id="cd-date"
                    value={targetDate}
                    min={finished ? undefined : today}
                    invalid={passed || Boolean(fieldErrors.target_date)}
                    onChange={setTargetDate}
                />
                <div className="cd-form-quick" role="group" aria-label="Quick dates">
                    {QUICK_TARGETS.map(q => {
                        const value = addMonths(today, q.months);
                        return (
                            <button key={q.label} type="button" className={`cd-form-quick-chip${targetDate === value ? " is-on" : ""}`} onClick={() => setTargetDate(value)}>
                                {q.label}
                            </button>
                        );
                    })}
                </div>
                <div className={`cd-form-hint${passed || fieldErrors.target_date ? " is-error" : ""}`}>{fieldErrors.target_date ?? dateHint}</div>

                <div className="cd-form-inline">
                    <span className="cd-form-label mb-0">Colour</span>
                    <div className="cd-form-colors" role="radiogroup" aria-label="Colour">
                        {COUNTDOWN_COLORS.map(c => (
                            <button
                                key={c.key}
                                type="button"
                                role="radio"
                                aria-checked={color === c.key}
                                aria-label={c.label}
                                title={c.label}
                                className={`cd-form-color${color === c.key ? " is-on" : ""}`}
                                style={{ "--cd-color": c.css } as React.CSSProperties}
                                onClick={() => setColor(c.key)}
                            />
                        ))}
                    </div>
                </div>

                <label htmlFor="cd-note" className="cd-form-label">Why does it matter? <span className="cd-form-optional">optional</span></label>
                <textarea
                    id="cd-note"
                    className="form-control"
                    rows={2}
                    maxLength={NOTE_MAX}
                    value={note}
                    placeholder="A line to remind you why you're doing this"
                    onChange={e => setNote(e.target.value)}
                />

                {showStart ? (
                    <div className="cd-form-since">
                        <label htmlFor="cd-start" className="cd-form-label">Counting since</label>
                        <CountdownDateField id="cd-start" value={startDate} max={today} invalid={Boolean(fieldErrors.start_date)} placeholder="Today" onChange={setStartDate} />
                        <div className={`cd-form-hint${fieldErrors.start_date ? " is-error" : ""}`}>
                            {fieldErrors.start_date ?? "The ring fills from this day to the date above. Leave it empty to start today."}
                        </div>
                    </div>
                ) : (
                    <button type="button" className="btn btn-link btn-sm p-0 mt-3 cd-form-link" onClick={() => setShowStart(true)}>
                        Planned this a while ago?
                    </button>
                )}

                {error && <div className="cd-form-error mt-3">{error}</div>}

                <div className="d-flex justify-content-end gap-2 mt-4">
                    <button type="button" className="btn btn-outline-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
                    <button type="button" className="btn btn-brand" onClick={() => void submit()} disabled={!canSave}>
                        {busy ? "Saving…" : editing ? "Save" : "Start counting"}
                    </button>
                </div>
            </Modal.Body>
        </Modal>
    );
}
