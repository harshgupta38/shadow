import { useId } from "react";

interface CountdownRingProps {
    /** How far along the count is, 0 to 100. */
    percent: number;
    /** The big text in the middle, normally the days left. */
    value: string;
    /** The small text under it. */
    caption: string;
    ariaLabel: string;
    size?: number;
    stroke?: number;
}

/** The progress ring the dashboard cards use, in the countdown's own colour: a track, a rounded arc, a value and a caption. */
export function CountdownRing({ percent, value, caption, ariaLabel, size = 76, stroke = 7 }: CountdownRingProps) {
    const gradientId = useId();
    const radius = (size - stroke) / 2;
    const circumference = 2 * Math.PI * radius;
    const filled = Math.max(0, Math.min(100, percent));
    const isWord = value.length > 3;

    return (
        <div className="cd-ring" style={{ width: size, height: size }} role="img" aria-label={ariaLabel}>
            <svg width={size} height={size} aria-hidden="true">
                <defs>
                    <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="var(--cd-color)" />
                        <stop offset="100%" stopColor="color-mix(in srgb, var(--cd-color) 55%, var(--jv-brand-2))" />
                    </linearGradient>
                </defs>
                <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="color-mix(in srgb, var(--jv-border) 88%, transparent)" strokeWidth={stroke} />
                {filled > 0 && (
                    <circle
                        className="cd-ring-arc"
                        cx={size / 2} cy={size / 2} r={radius}
                        fill="none" stroke={`url(#${gradientId})`} strokeWidth={stroke} strokeLinecap="round"
                        strokeDasharray={circumference} strokeDashoffset={circumference * (1 - filled / 100)}
                        transform={`rotate(-90 ${size / 2} ${size / 2})`}
                    />
                )}
            </svg>
            <div className="cd-ring-label">
                <span className={`cd-ring-value${isWord ? " is-word" : ""}`}>{value}</span>
                {caption && <span className="cd-ring-caption">{caption}</span>}
            </div>
        </div>
    );
}
