import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { BrightnessHighFill, PauseFill, PlayFill } from "react-bootstrap-icons";

import { api } from "@/api";
import type { DailyBriefResponse } from "@/api/types";
import { PageHeader } from "@/components/ui/PageHeader/PageHeader";
import { useAccessibility } from "@/context/AccessibilityContext";
import { useToast } from "@/context/ToastContext";
import { useLazyAudio } from "@/hooks/useLazyAudio";
import type { LazyAudioState } from "@/hooks/useLazyAudio";
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

// ── Audio player bar ──────────────────────────────────────────────────────────
// Spotify-style: play/pause + scrubbable seek bar. Before any audio has been
// generated (or if it failed), the bar is shown blurred/disabled with a
// "Listen"/"Retry" CTA overlaid on top instead of a separate header button.

function formatDuration(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
}

interface AudioPlayerBarProps {
    state: LazyAudioState;
    currentTime: number;
    duration: number;
    hasAudio: boolean;
    /** Past days with no cached audio can no longer generate one — show a plain message instead of a CTA. */
    canGenerate: boolean;
    onToggle: () => void;
    onSeek: (time: number) => void;
    onBeginScrub: () => void;
    onEndScrub: () => void;
}

function AudioPlayerBar({ state, currentTime, duration, hasAudio, canGenerate, onToggle, onSeek, onBeginScrub, onEndScrub }: AudioPlayerBarProps) {
    const unlocked = hasAudio;
    const isLoading = state === "loading";
    const overlayLabel = isLoading ? "Loading…" : state === "error" ? "Retry" : "Listen";

    return (
        <div className={`brief-audio-bar${unlocked ? "" : " brief-audio-bar--locked"}`}>
            <div className="brief-audio-bar-inner" aria-hidden={!unlocked}>
                <button
                    type="button"
                    className="brief-audio-play-btn"
                    onClick={onToggle}
                    disabled={!unlocked || isLoading}
                    aria-label={state === "playing" ? "Pause" : "Play"}
                >
                    {isLoading
                        ? <span className="spinner-border spinner-border-sm" aria-hidden="true" />
                        : state === "playing" ? <PauseFill size={18} /> : <PlayFill size={18} />}
                </button>
                <span className="brief-audio-time">{formatDuration(currentTime)}</span>
                <input
                    type="range"
                    className="brief-audio-seek"
                    min={0}
                    max={duration || 0}
                    step={0.1}
                    value={currentTime}
                    disabled={!unlocked || isLoading}
                    onChange={(e) => onSeek(Number(e.target.value))}
                    onMouseDown={onBeginScrub}
                    onTouchStart={onBeginScrub}
                    onMouseUp={onEndScrub}
                    onTouchEnd={onEndScrub}
                    onBlur={onEndScrub}
                    aria-label="Seek"
                />
                <span className="brief-audio-time">{formatDuration(duration)}</span>
            </div>

            {!unlocked && (
                <div className="brief-audio-lock-overlay">
                    {canGenerate ? (
                        <button
                            type="button"
                            className="btn btn-brand brief-audio-listen-cta"
                            onClick={onToggle}
                            disabled={isLoading}
                        >
                            {isLoading
                                ? <span className="spinner-border spinner-border-sm" aria-hidden="true" />
                                : <PlayFill size={14} />}
                            {overlayLabel}
                        </button>
                    ) : (
                        <span className="brief-audio-unavailable-msg">No audio available for this day</span>
                    )}
                </div>
            )}
        </div>
    );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function DailyBriefPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const dateParam = searchParams.get("date") ?? undefined;
    const displayDate = dateParam ?? todayISTString();

    const [brief, setBrief] = useState<DailyBriefResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { accessibility_reduced_motion } = useAccessibility();
    const toast = useToast();

    useEffect(() => {
        setLoading(true);
        setError(null);
        setBrief(null);

        api.dailyBrief.get(dateParam)
            .then(setBrief)
            .catch(() => setError("Could not load the brief. Please try again."))
            .finally(() => setLoading(false));
    }, [dateParam]);

    const subtitle = formatDisplayDate(displayDate);

    const fullText = brief?.complete_brief ?? "";
    const { visible, done, skip } = useTypewriter(fullText, !accessibility_reduced_motion);

    // Real natural-sounding voice only (OpenAI TTS, cached server-side) — no browser
    // speechSynthesis fallback; if generation fails, "Listen" just becomes unavailable.
    const audio = useLazyAudio(() => api.dailyBrief.getAudio(displayDate), displayDate);

    useEffect(() => {
        if (audio.state === "error") toast.error("Couldn't generate audio for this brief. Please try again later.");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [audio.state]);

    const paragraphs = visible.split("\n\n").map(p => p.trim()).filter(Boolean);

    function handleAudioToggle() {
        if (audio.state === "idle" || audio.state === "error") skip(); // reveal full text so it's readable alongside the audio
        void audio.toggle();
    }

    return (
        <section className="brief-page">
            <PageHeader
                icon={<BrightnessHighFill size={20} />}
                title="Daily Brief"
                subtitle={subtitle}
                onBack={() => navigate(-1)}
            />

            {loading && <Skeleton />}

            {!loading && error && (
                <p className="brief-empty">{error}</p>
            )}

            {!loading && !error && paragraphs.length > 0 && (
                <>
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

                    <AudioPlayerBar
                        state={audio.state}
                        currentTime={audio.currentTime}
                        duration={audio.duration}
                        hasAudio={(brief?.has_audio ?? false) || audio.loaded}
                        canGenerate={displayDate >= todayISTString()}
                        onToggle={handleAudioToggle}
                        onSeek={audio.seek}
                        onBeginScrub={audio.beginScrub}
                        onEndScrub={audio.endScrub}
                    />
                </>
            )}

            {!loading && !error && paragraphs.length === 0 && (
                <p className="brief-empty">
                    No brief has been generated for this day yet. Open your plan to trigger it.
                </p>
            )}
        </section>
    );
}
