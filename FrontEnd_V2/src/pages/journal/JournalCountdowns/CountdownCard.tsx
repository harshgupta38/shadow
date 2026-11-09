import { CheckCircleFill, CheckLg, JournalText, PencilSquare } from "react-bootstrap-icons";
import { useDateFormat } from "@/context/PlannerContext";
import { formatDisplayDate } from "@/services/date.service";
import type { CountdownResponse } from "@/api/types";
import { CountdownRing } from "@/pages/journal/JournalCountdowns/CountdownRing";
import { colorCss, daysDisplay, isOverdue, ringDisplay } from "@/pages/journal/JournalCountdowns/JournalCountdowns.constants";

interface CountdownCardProps {
    countdown: CountdownResponse;
    /** The day open in the editor is already a note for this countdown. */
    noted: boolean;
    busy?: boolean;
    onOpen: () => void;
    onWriteNote: () => void;
    onMarkAchieved: () => void;
}

export function CountdownCard({ countdown, noted, busy = false, onOpen, onWriteNote, onMarkAchieved }: CountdownCardProps) {
    const dateFormat = useDateFormat();
    const overdue = isOverdue(countdown);
    const isToday = countdown.status === "active" && countdown.days_left === 0;
    const ring = ringDisplay(countdown.days_left);
    const spoken = daysDisplay(countdown.days_left);
    const className = ["cd-card", isToday && "is-today", overdue && "is-overdue"].filter(Boolean).join(" ");

    return (
        <div
            className={className}
            style={{ "--cd-color": colorCss(countdown.color) } as React.CSSProperties}
            role="button"
            tabIndex={0}
            onClick={onOpen}
            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
            aria-label={`${countdown.title}: ${spoken.value} ${spoken.label}. Open details`}
        >
            <CountdownRing
                percent={countdown.progress_pct}
                value={ring.value}
                caption={ring.caption}
                ariaLabel={`${countdown.progress_pct}% of the way there`}
            />

            <div className="cd-card-body">
                <div className="cd-card-head">
                    <span className="cd-card-emoji" aria-hidden="true">{countdown.emoji}</span>
                    <span className="cd-card-title">{countdown.title}</span>
                </div>
                <div className="cd-card-date">{formatDisplayDate(countdown.target_date, dateFormat)}</div>

                <div className="cd-card-foot">
                    {countdown.tasks_total > 0 && (
                        <span className="cd-card-stat" title={`${countdown.tasks_done} of ${countdown.tasks_total} tasks done`}>
                            <CheckCircleFill size={11} /> {countdown.tasks_done}/{countdown.tasks_total}
                        </span>
                    )}
                    {countdown.notes_count > 0 && (
                        <span className="cd-card-stat" title={`${countdown.notes_count} journal note${countdown.notes_count === 1 ? "" : "s"}`}>
                            <JournalText size={11} /> {countdown.notes_count}
                        </span>
                    )}
                    {overdue ? (
                        <button
                            type="button"
                            className="cd-card-action cd-card-action--primary"
                            disabled={busy}
                            onClick={e => { e.stopPropagation(); onMarkAchieved(); }}
                        >
                            <CheckLg size={12} /> It happened
                        </button>
                    ) : (
                        <button
                            type="button"
                            className={`cd-card-action${noted ? " is-on" : ""}`}
                            onClick={e => { e.stopPropagation(); onWriteNote(); }}
                            title={noted ? "The open journal day is a note for this" : "Make the open journal day a note for this"}
                        >
                            {noted ? <CheckLg size={12} /> : <PencilSquare size={12} />} {noted ? "Noted" : "Add a note"}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
