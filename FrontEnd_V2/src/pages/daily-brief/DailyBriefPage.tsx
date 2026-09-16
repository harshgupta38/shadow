import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BrightnessHighFill } from "react-bootstrap-icons";

import { api } from "@/api";
import type { DailyBriefResponse } from "@/api/types";
import { PageHeader } from "@/components/ui/PageHeader/PageHeader";
import { useAccessibility } from "@/context/AccessibilityContext";
import { TYPEWRITER } from "@/constant/tuning";

import "./DailyBriefPage.scss";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDisplayDate(iso: string): string {
    try {
        const [y, m, d] = iso.split("-").map(Number);
        return new Date(y, m - 1, d).toLocaleDateString("en-IN", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
        });
    } catch {
        return iso;
    }
}

function todayISTString(): string {
    return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); // YYYY-MM-DD
}

// ── Typewriter reveal ─────────────────────────────────────────────────────────
// Reveals text a few characters at a time so the brief feels like it's being
// written for you rather than dumped as a wall of text. Pauses briefly at
// paragraph breaks for a natural rhythm. Skipped entirely when the user has
// "reduce motion" on, and can be skipped mid-animation with a click/tap.

function useTypewriter(text: string, enabled: boolean): { visible: string; done: boolean; skip: () => void } {
    const [visibleLength, setVisibleLength] = useState(enabled ? 0 : text.length);
    const [done, setDone] = useState(!enabled);
    const skippedRef = useRef(false);

    useEffect(() => {
        skippedRef.current = false;

        if (!enabled || !text) {
            setVisibleLength(text.length);
            setDone(true);
            return;
        }

        setVisibleLength(0);
        setDone(false);

        let cancelled = false;
        let i = 0;
        let timer: ReturnType<typeof setTimeout>;

        function tick() {
            if (cancelled) return;
            if (skippedRef.current) {
                setVisibleLength(text.length);
                setDone(true);
                return;
            }
            const prev = i;
            i = Math.min(i + TYPEWRITER.CHARS_PER_TICK, text.length);
            setVisibleLength(i);
            if (i >= text.length) {
                setDone(true);
                return;
            }
            const crossedParagraphBreak = text.slice(prev, i).includes("\n");
            timer = setTimeout(tick, crossedParagraphBreak ? TYPEWRITER.PARAGRAPH_PAUSE_MS : TYPEWRITER.TICK_MS);
        }

        timer = setTimeout(tick, TYPEWRITER.TICK_MS);
        return () => { cancelled = true; clearTimeout(timer); };
    }, [text, enabled]);

    return {
        visible: text.slice(0, visibleLength),
        done,
        skip: () => { skippedRef.current = true; },
    };
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function Skeleton() {
    return (
        <div className="brief-skel" aria-busy aria-label="Loading brief…">
            {["long", "medium", "long", "short", "long", "medium", "long", "short"].map(
                (size, i) => (
                    <div key={i} className={`brief-skel-line brief-skel-line--${size}`} />
                )
            )}
        </div>
    );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function DailyBriefPage() {
    const [searchParams] = useSearchParams();
    const dateParam = searchParams.get("date") ?? undefined;
    const displayDate = dateParam ?? todayISTString();

    const [brief, setBrief] = useState<DailyBriefResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { accessibility_reduced_motion } = useAccessibility();

    useEffect(() => {
        setLoading(true);
        setError(null);
        setBrief(null);

        api.notifications.getDailyBrief(dateParam)
            .then(setBrief)
            .catch(() => setError("Could not load the brief. Please try again."))
            .finally(() => setLoading(false));
    }, [dateParam]);

    const subtitle = formatDisplayDate(displayDate);

    const fullText = brief?.complete_brief ?? "";
    const { visible, done, skip } = useTypewriter(fullText, !accessibility_reduced_motion);

    const paragraphs = visible.split("\n\n").map(p => p.trim()).filter(Boolean);

    return (
        <section className="brief-page">
            <PageHeader
                icon={<BrightnessHighFill size={20} />}
                title="Daily Brief"
                subtitle={subtitle}
            />

            {loading && <Skeleton />}

            {!loading && error && (
                <p className="brief-empty">{error}</p>
            )}

            {!loading && !error && paragraphs.length > 0 && (
                <div
                    className={`brief-content${done ? "" : " brief-content--typing"}`}
                    onClick={done ? undefined : skip}
                >
                    {paragraphs.map((p, i) => (
                        <p key={i} className="brief-paragraph">
                            {p}
                            {!done && i === paragraphs.length - 1 && (
                                <span className="brief-cursor" aria-hidden="true" />
                            )}
                        </p>
                    ))}
                    {!done && <span className="brief-skip-hint">Tap to show full brief</span>}
                </div>
            )}

            {!loading && !error && paragraphs.length === 0 && (
                <p className="brief-empty">
                    No brief has been generated for this day yet. Open your plan to trigger it.
                </p>
            )}
        </section>
    );
}
