import type { ReactNode } from "react";

import "@/components/ui/ComingSoonState/ComingSoonState.scss";

interface ComingSoonStateProps {
    title: string;
    text?: string;
    /** Override the default rocket illustration with a custom one. */
    illustration?: ReactNode;
}

function RocketIllustration() {
    return (
        <svg
            className="coming-soon-state-svg"
            viewBox="0 0 400 300"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            role="img"
            aria-hidden="true"
        >
            <defs>
                <linearGradient id="csRocketGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="var(--jv-brand-1)" />
                    <stop offset="100%" stopColor="var(--jv-brand-2)" />
                </linearGradient>
            </defs>

            {/* ascending trajectory */}
            <path
                d="M120 250 C 150 210, 170 170, 205 150"
                className="coming-soon-state-svg-trail"
                fill="none"
                strokeLinecap="round"
                strokeDasharray="2 14"
            />

            {/* rocket */}
            <g transform="translate(210 150) rotate(32)">
                <path
                    d="M0 -78 C 22 -52 24 6 15 40 L -15 40 C -24 6 -22 -52 0 -78 Z"
                    fill="url(#csRocketGrad)"
                    className="coming-soon-state-svg-body-shadow"
                />
                <circle cx="0" cy="-24" r="12" className="coming-soon-state-svg-window" />
                <path d="M-15 26 L-34 54 L-15 44 Z" className="coming-soon-state-svg-fin" />
                <path d="M15 26 L34 54 L15 44 Z" className="coming-soon-state-svg-fin" />
                <path
                    d="M-9 40 C -12 56 -5 68 0 76 C 5 68 12 56 9 40 Z"
                    className="coming-soon-state-svg-flame"
                />
            </g>

            {/* floating specks */}
            <circle cx="70" cy="90" r="3" className="coming-soon-state-svg-speck" />
            <circle cx="330" cy="110" r="4" className="coming-soon-state-svg-speck" />
            <circle cx="300" cy="220" r="2.5" className="coming-soon-state-svg-speck" />
            <circle cx="95" cy="200" r="2.5" className="coming-soon-state-svg-speck" />
        </svg>
    );
}

export function ComingSoonState({ title, text, illustration }: ComingSoonStateProps) {
    return (
        <div className="coming-soon-state surface">
            <div className="coming-soon-state-illustration">{illustration ?? <RocketIllustration />}</div>
            <span className="coming-soon-state-badge">Coming soon</span>
            <h2 className="coming-soon-state-title">{title}</h2>
            {text && <p className="coming-soon-state-text">{text}</p>}
        </div>
    );
}
