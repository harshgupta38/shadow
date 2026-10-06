import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "react-bootstrap-icons";

interface TaskRangeCalendarProps {
    startDate: string; // YYYY-MM-DD
    endDate: string;   // YYYY-MM-DD
    subtaskDates?: string[];
    onDateClick?: (date: string) => void;
}

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
];

function todayStr(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function TaskRangeCalendar({ startDate, endDate, subtaskDates = [], onDateClick }: TaskRangeCalendarProps) {
    const startYear  = Number(startDate.slice(0, 4));
    const startMonth = Number(startDate.slice(5, 7)) - 1; // 0-indexed
    const endYear    = Number(endDate.slice(0, 4));
    const endMonth   = Number(endDate.slice(5, 7)) - 1;

    const [viewYear, setViewYear] = useState(startYear);
    const [viewMonth, setViewMonth] = useState(startMonth);

    const subtaskSet = useMemo(() => new Set(subtaskDates), [subtaskDates]);
    const today = useMemo(todayStr, []);

    const cells = useMemo(() => {
        const firstOfMonth = new Date(viewYear, viewMonth, 1);
        const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
        const leadingBlanks = firstOfMonth.getDay(); // 0 = Sunday

        const out: Array<{ dateStr: string; dow: number } | null> = Array.from({ length: leadingBlanks }, () => null);
        for (let d = 1; d <= daysInMonth; d++) {
            const ds = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
            out.push({ dateStr: ds, dow: (leadingBlanks + d - 1) % 7 });
        }
        return out;
    }, [viewYear, viewMonth]);

    const atMinMonth = viewYear === startYear && viewMonth === startMonth;
    const atMaxMonth = viewYear === endYear   && viewMonth === endMonth;

    function prevMonth() {
        if (atMinMonth) return;
        if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
        else setViewMonth(m => m - 1);
    }
    function nextMonth() {
        if (atMaxMonth) return;
        if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
        else setViewMonth(m => m + 1);
    }

    return (
        <div className="task-range-calendar">
            <div className="trc-header">
                <button type="button" className="btn btn-ghost btn-icon trc-nav" onClick={prevMonth} disabled={atMinMonth} aria-label="Previous month">
                    <ChevronLeft size={13} />
                </button>
                <span className="trc-month-label">{MONTH_NAMES[viewMonth]} {viewYear}</span>
                <button type="button" className="btn btn-ghost btn-icon trc-nav" onClick={nextMonth} disabled={atMaxMonth} aria-label="Next month">
                    <ChevronRight size={13} />
                </button>
            </div>

            <div className="trc-grid">
                {WEEKDAYS.map(w => <span key={w} className="trc-weekday">{w}</span>)}

                {cells.map((cell, i) => {
                    if (!cell) return <span key={`b-${i}`} className="trc-cell" />;

                    const { dateStr, dow } = cell;
                    const inRange = dateStr >= startDate && dateStr <= endDate;
                    const isStart = dateStr === startDate;
                    const isEnd = dateStr === endDate;
                    const isToday = dateStr === today;
                    const hasSubtask = subtaskSet.has(dateStr);
                    const bandLeft = inRange && (isStart || dow === 0);
                    const bandRight = inRange && (isEnd || dow === 6);

                    const cls = [
                        "trc-cell",
                        inRange && "is-in-range",
                        isStart && "is-range-start",
                        isEnd && "is-range-end",
                        isToday && "is-today",
                        bandLeft && "is-band-left",
                        bandRight && "is-band-right",
                    ].filter(Boolean).join(" ");

                    return (
                        <span
                            key={dateStr}
                            className={cls}
                            onClick={inRange && onDateClick ? () => onDateClick(dateStr) : undefined}
                            title={inRange ? "Add sub-task" : undefined}
                        >
                            <span className="trc-num">{Number(dateStr.slice(8))}</span>
                            {hasSubtask && <span className="trc-dot" />}
                        </span>
                    );
                })}
            </div>
        </div>
    );
}
