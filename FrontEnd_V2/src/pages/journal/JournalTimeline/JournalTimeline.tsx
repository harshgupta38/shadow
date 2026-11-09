import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ExclamationCircleFill, PencilSquare } from "react-bootstrap-icons";
import { api } from "@/api";
import type { CountdownResponse, JournalEntryResponse } from "@/api/types";
import { colorCss } from "@/pages/journal/JournalCountdowns/JournalCountdowns.constants";
import { dayParts, fmtMonthTitle, monthOf, monthRange, shiftMonth, todayIso } from "@/services/date.service";
import {
    COLLAPSED_MAX_PX,
    MOOD_BY_KEY,
    hasContent,
    mergeEntry,
    newestFirst,
    sanitizeEntryHtml,
} from "@/pages/journal/JournalTimeline/JournalTimeline.constants";
import "./JournalTimeline.scss";

type Status = "loading" | "ready" | "error";

interface JournalTimelineProps {
    /** The month being shown, "YYYY-MM". */
    month: string;
    selectedDate: string;
    /** The entry the editor saved last, so the timeline updates without reloading the month. */
    savedEntry: JournalEntryResponse | null;
    /** The person's countdowns, to name the ones an entry is a note for. */
    countdowns: CountdownResponse[];
    onChangeMonth: (month: string) => void;
    onOpenEntry: (date: string) => void;
}

interface TimelineItemProps {
    entry: JournalEntryResponse;
    selected: boolean;
    tags: CountdownResponse[];
    onOpen: (date: string) => void;
}

function TimelineItem({ entry, selected, tags, onOpen }: TimelineItemProps) {
    const mood = entry.mood ? MOOD_BY_KEY[entry.mood] : null;
    const html = useMemo(() => sanitizeEntryHtml(entry.text), [entry.text]);
    const hasText = html.replace(/<[^>]*>/g, "").trim() !== "";
    const { day, weekday } = dayParts(entry.entry_date);

    const bodyRef = useRef<HTMLDivElement>(null);
    const [expanded, setExpanded] = useState(false);
    const [overflowing, setOverflowing] = useState(false);

    // A long entry stays collapsed until asked for; short ones never show the button.
    useLayoutEffect(() => {
        const el = bodyRef.current;
        if (!el) {
            setOverflowing(false);
            return;
        }
        const measure = () => setOverflowing(el.scrollHeight > COLLAPSED_MAX_PX + 2);
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(el);
        return () => observer.disconnect();
    }, [html]);

    return (
        <li
            className={`jnl-tl-item${selected ? " is-selected" : ""}`}
            style={{ "--mood-color": mood?.color ?? "var(--jv-faint)" } as React.CSSProperties}
        >
            <time className="jnl-tl-date" dateTime={entry.entry_date}>
                <span className="jnl-tl-day">{day}</span>
                <span className="jnl-tl-dow">{weekday}</span>
            </time>

            <span className="jnl-tl-dot" aria-hidden="true">{mood?.emoji}</span>

            <div className="jnl-tl-card">
                <button
                    type="button"
                    className="btn btn-ghost btn-icon border-0 jnl-tl-edit"
                    onClick={() => onOpen(entry.entry_date)}
                    aria-label={`Open ${entry.entry_date} in the editor`}
                    title="Edit this day"
                >
                    <PencilSquare size={13} />
                </button>

                {mood && <span className="jnl-tl-mood">{mood.label}</span>}

                {tags.length > 0 && (
                    <div className="cd-entry-tags">
                        {tags.map(c => (
                            <span key={c.id} className="cd-entry-tag" style={{ "--cd-color": colorCss(c.color) } as React.CSSProperties} title={`A note for ${c.title}`}>
                                <span aria-hidden="true">{c.emoji}</span>
                                <span>{c.title}</span>
                            </span>
                        ))}
                    </div>
                )}

                {hasText && (
                    <div
                        ref={bodyRef}
                        className={`jnl-tl-text${overflowing && !expanded ? " is-clamped" : ""}`}
                        dangerouslySetInnerHTML={{ __html: html }}
                    />
                )}

                {overflowing && (
                    <button type="button" className="btn btn-link btn-sm p-0 jnl-tl-more" onClick={() => setExpanded(v => !v)} aria-expanded={expanded}>
                        {expanded ? "Show less" : "Show more"}
                    </button>
                )}
            </div>
        </li>
    );
}

export function JournalTimeline({ month, selectedDate, savedEntry, countdowns, onChangeMonth, onOpenEntry }: JournalTimelineProps) {
    const [entries, setEntries] = useState<JournalEntryResponse[]>([]);
    const [status, setStatus] = useState<Status>("loading");
    const [reloadKey, setReloadKey] = useState(0);
    const savedRef = useRef(savedEntry);
    savedRef.current = savedEntry;

    const canGoNext = month < monthOf(todayIso());
    const title = fmtMonthTitle(month);

    useEffect(() => {
        let active = true;
        setStatus("loading");
        setEntries([]);
        const { start, end } = monthRange(month);
        void api.journal.getEntries(start, end)
            .then(list => {
                if (!active) return;
                // A save that finished while this month was loading must not be overwritten by older rows.
                const saved = savedRef.current;
                const sorted = newestFirst(list);
                setEntries(saved && monthOf(saved.entry_date) === month ? mergeEntry(sorted, saved) : sorted);
                setStatus("ready");
            })
            .catch(() => { if (active) setStatus("error"); });
        return () => { active = false; };
    }, [month, reloadKey]);

    useEffect(() => {
        if (!savedEntry || monthOf(savedEntry.entry_date) !== month) return;
        setEntries(prev => mergeEntry(prev, savedEntry));
    }, [savedEntry, month]);

    const visible = useMemo(() => entries.filter(hasContent), [entries]);

    return (
        <section className="surface jnl-tl mt-3" aria-label={`Journal entries for ${title}`}>
            <div className="jnl-tl-head">
                <h2 className="jnl-tl-title">{title}</h2>
                <div className="jnl-tl-nav">
                    <button type="button" className="btn btn-ghost btn-icon border-0" onClick={() => onChangeMonth(shiftMonth(month, -1))} aria-label="Previous month">
                        <ChevronLeft size={15} />
                    </button>
                    <button type="button" className="btn btn-ghost btn-icon border-0" onClick={() => onChangeMonth(shiftMonth(month, 1))} disabled={!canGoNext} aria-label="Next month">
                        <ChevronRight size={15} />
                    </button>
                </div>
            </div>

            <div className="jnl-tl-body">
                {status === "loading" && (
                    <div className="jnl-tl-skeleton" aria-hidden="true">
                        <span /><span /><span />
                    </div>
                )}

                {status === "error" && (
                    <p className="jnl-tl-note jnl-tl-note--error">
                        <ExclamationCircleFill size={12} /> Couldn't load this month{" "}
                        <button type="button" className="btn btn-link btn-sm p-0 align-baseline" onClick={() => setReloadKey(k => k + 1)}>Retry</button>
                    </p>
                )}

                {status === "ready" && visible.length === 0 && (
                    <p className="jnl-tl-note">Nothing written in {title} yet.</p>
                )}

                {status === "ready" && visible.length > 0 && (
                    <ol className="jnl-tl-list">
                        {visible.map(entry => (
                            <TimelineItem
                                key={entry.entry_date}
                                entry={entry}
                                selected={entry.entry_date === selectedDate}
                                tags={countdowns.filter(c => entry.countdown_ids.includes(c.id))}
                                onOpen={onOpenEntry}
                            />
                        ))}
                    </ol>
                )}
            </div>
        </section>
    );
}
