import { useRef } from "react";
import { CalendarEvent } from "react-bootstrap-icons";
import { useDateFormat } from "@/context/PlannerContext";
import { formatDisplayDate } from "@/services/date.service";

interface CountdownDateFieldProps {
    id: string;
    /** YYYY-MM-DD, or empty. */
    value: string;
    onChange: (value: string) => void;
    min?: string;
    max?: string;
    placeholder?: string;
    invalid?: boolean;
    ariaLabel?: string;
    className?: string;
}

/**
 * A date field that reads as "17 February 2027" (the person's date format) instead of the browser's own text. The real,
 * invisible native date input covers it, so the calendar, the keyboard and min/max all still work.
 */
export function CountdownDateField({ id, value, onChange, min, max, placeholder = "Pick a date", invalid = false, ariaLabel, className = "" }: CountdownDateFieldProps) {
    const dateFormat = useDateFormat();
    const inputRef = useRef<HTMLInputElement>(null);

    function openPicker() {
        try {
            inputRef.current?.showPicker?.();
        } catch {
            // Not allowed outside a click or in an older browser: the native input still takes the click itself.
        }
    }

    return (
        <div className={`cd-date-field form-control${invalid ? " is-invalid" : ""} ${className}`.trim()}>
            <span className={`cd-date-text${value ? "" : " is-placeholder"}`}>{value ? formatDisplayDate(value, dateFormat) : placeholder}</span>
            <CalendarEvent size={14} className="cd-date-icon" aria-hidden="true" />
            <input
                ref={inputRef}
                id={id}
                type="date"
                className="cd-date-native"
                value={value}
                min={min}
                max={max}
                aria-label={ariaLabel}
                onChange={e => onChange(e.target.value)}
                onClick={openPicker}
            />
        </div>
    );
}
