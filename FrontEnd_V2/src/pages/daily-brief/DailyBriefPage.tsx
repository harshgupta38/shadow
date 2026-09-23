import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { BrightnessHighFill, PauseFill, PlayFill } from "react-bootstrap-icons";

import { api } from "@/api";
import type { DailyBriefResponse, WordTiming } from "@/api/types";
import { PageHeader } from "@/components/ui/PageHeader/PageHeader";
import { useAccessibility } from "@/context/AccessibilityContext";
import { useToast } from "@/context/ToastContext";
import { useLazyAudio } from "@/hooks/useLazyAudio";
import type { LazyAudioState } from "@/hooks/useLazyAudio";
import { CAPTIONS, TYPEWRITER } from "@/constant/tuning";

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

// ── Movie-style captions ──────────────────────────────────────────────────────
// Backed by real per-word timestamps (from transcribing our own generated audio
// server-side) rather than guessed from text — so lines switch exactly when the
// words are actually spoken. We just group consecutive words into short lines
// here, using the real timing gaps between words as natural break points.

interface CaptionLine {
    text: string;
    start: number;
}

const MIN_LINE_WORDS = CAPTIONS.MIN_LINE_WORDS;
const MAX_LINE_WORDS = CAPTIONS.MAX_LINE_WORDS;
const MAX_LINE_SECONDS = CAPTIONS.MAX_LINE_SECONDS;
const PAUSE_GAP_SECONDS = CAPTIONS.PAUSE_GAP_SECONDS;

function groupCaptionLines(words: WordTiming[]): CaptionLine[] {
    const lines: CaptionLine[] = [];
    let buffer: WordTiming[] = [];

    function flush() {
        if (buffer.length === 0) return;
        lines.push({ text: buffer.map((w) => w.word).join(" ").trim(), start: buffer[0].start });
        buffer = [];
    }

    for (const word of words) {
        if (buffer.length > 0) {
            const gapFromPrev = word.start - buffer[buffer.length - 1].end;
            const spanIfAdded = word.end - buffer[0].start;
            const hitPause = gapFromPrev > PAUSE_GAP_SECONDS;
            const hitMaxWords = buffer.length >= MAX_LINE_WORDS;
            const hitMaxSpan = spanIfAdded > MAX_LINE_SECONDS;
            // A pause alone shouldn't break the line until it's at least
            // MIN_LINE_WORDS long — otherwise a natural breath mid-sentence
            // produces a stray 1-2 word caption. Word/span caps still apply
            // regardless, so lines never run on too long.
            if ((hitPause && buffer.length >= MIN_LINE_WORDS) || hitMaxWords || hitMaxSpan) {
                flush();
            }
        }
        buffer.push(word);
    }
    flush();
    return lines;
}

function useCaptionLines(words: WordTiming[]): CaptionLine[] {
    return useMemo(() => groupCaptionLines(words), [words]);
}

/** Index of the most recent line whose start has passed (-1 if none yet) —
 * avoids blanking out during brief pauses by holding the last active line. */
function pickActiveCaptionIndex(lines: CaptionLine[], currentTime: number): number {
    let selected = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].start > currentTime) break;
        selected = i;
    }
    return selected;
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
    /** Current caption line, shown above the seek bar whenever timing data exists (not gated on play state). */
    subtitle?: string;
    /** Upcoming caption line, peeking below the active one for the drum-roll effect. */
    nextSubtitle?: string;
    /** Skips the roll animation for users who've asked for reduced motion. */
    reducedMotion?: boolean;
    onToggle: () => void;
    onSeek: (time: number) => void;
    onBeginScrub: () => void;
    onEndScrub: () => void;
}

function AudioPlayerBar({ state, currentTime, duration, hasAudio, canGenerate, subtitle, nextSubtitle, reducedMotion, onToggle, onSeek, onBeginScrub, onEndScrub }: AudioPlayerBarProps) {
    const unlocked = hasAudio;
    const isLoading = state === "loading";
    const overlayLabel = isLoading ? "Loading…" : state === "error" ? "Retry" : "Hear Your Day";

    return (
        <div className={`brief-audio-bar${unlocked ? "" : " brief-audio-bar--locked"}`}>
            <div className="brief-audio-bar-inner" aria-hidden={!unlocked}>
                <div className="brief-audio-row brief-audio-row--top">
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
                    {subtitle && (
                        <div className={`brief-caption-roll${reducedMotion ? " brief-caption-roll--static" : ""}`}>
                            <div key={subtitle} className="brief-caption-line brief-caption-line--active">{subtitle}</div>
                            {nextSubtitle && (
                                <div key={nextSubtitle} className="brief-caption-line brief-caption-line--next">{nextSubtitle}</div>
                            )}
                        </div>
                    )}
                </div>
                <div className="brief-audio-row brief-audio-row--seek">
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

    // Word timings are cached alongside the audio server-side — only fetch once
    // generation for this date has actually finished (audio.loaded flips true).
    const [captionWords, setCaptionWords] = useState<WordTiming[]>([]);
    useEffect(() => {
        setCaptionWords([]);
        if (!audio.loaded) return;
        api.dailyBrief.getCaptions(displayDate)
            .then(setCaptionWords)
            .catch(() => setCaptionWords([]));
    }, [audio.loaded, displayDate]);

    const captionLines = useCaptionLines(captionWords);
    // Not gated on play/pause state — scrubbing the seek bar while paused (or
    // before ever pressing play, since it's disabled until unlocked) should
    // still update the caption. Locked (no-audio) state hides it via blur anyway.
    const activeCaptionIndex = pickActiveCaptionIndex(captionLines, audio.currentTime);
    const currentSubtitle = activeCaptionIndex >= 0 ? captionLines[activeCaptionIndex].text : undefined;
    const nextSubtitle = activeCaptionIndex >= 0 ? captionLines[activeCaptionIndex + 1]?.text : undefined;

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

                    {brief?.audio_feature_enabled && (
                        <AudioPlayerBar
                            state={audio.state}
                            currentTime={audio.currentTime}
                            duration={audio.duration}
                            hasAudio={audio.loaded}
                            canGenerate={displayDate >= todayISTString()}
                            subtitle={currentSubtitle}
                            nextSubtitle={nextSubtitle}
                            reducedMotion={accessibility_reduced_motion}
                            onToggle={handleAudioToggle}
                            onSeek={audio.seek}
                            onBeginScrub={audio.beginScrub}
                            onEndScrub={audio.endScrub}
                        />
                    )}
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
