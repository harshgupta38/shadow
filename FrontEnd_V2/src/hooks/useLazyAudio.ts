import { useEffect, useRef, useState } from "react";

export type LazyAudioState = "idle" | "loading" | "playing" | "paused" | "error";

/**
 * Fetches an audio Blob on first play (via `loader`) and controls playback
 * through a plain `HTMLAudioElement`, exposing enough state (currentTime/
 * duration + seek) to drive a scrubbable player bar. Re-fetches whenever
 * `cacheKey` changes (e.g. a different date); within the same key, play/pause
 * reuse the same blob instead of re-fetching.
 */
export function useLazyAudio(loader: () => Promise<Blob>, cacheKey: string) {
    const [state, setState] = useState<LazyAudioState>("idle");
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [loaded, setLoaded] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const urlRef = useRef<string | null>(null);

    function cleanup() {
        audioRef.current?.pause();
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
        audioRef.current = null;
    }

    useEffect(() => {
        cleanup();
        setState("idle");
        setCurrentTime(0);
        setDuration(0);
        setLoaded(false);
        return cleanup;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cacheKey]);

    async function toggle() {
        if (state === "playing") {
            audioRef.current?.pause();
            setState("paused");
            return;
        }
        if (state === "paused" && audioRef.current) {
            await audioRef.current.play();
            setState("playing");
            return;
        }

        setState("loading");
        try {
            const blob = await loader();
            const url = URL.createObjectURL(blob);
            const audio = new Audio(url);
            audio.onended = () => { setState("idle"); setCurrentTime(0); };
            audio.onerror = () => setState("error");
            audio.ontimeupdate = () => setCurrentTime(audio.currentTime);
            audio.onloadedmetadata = () => setDuration(audio.duration || 0);
            urlRef.current = url;
            audioRef.current = audio;
            await audio.play();
            setState("playing");
            setLoaded(true);
        } catch {
            setState("error");
        }
    }

    function seek(time: number) {
        const audio = audioRef.current;
        if (!audio) return;
        audio.currentTime = time;
        setCurrentTime(time);
    }

    // Mute while the user drags the seek bar — repeatedly jumping currentTime
    // on every drag tick otherwise plays back as garbled/distorted audio.
    function beginScrub() {
        const audio = audioRef.current;
        if (audio) audio.muted = true;
    }

    function endScrub() {
        const audio = audioRef.current;
        if (audio) audio.muted = false;
    }

    return { state, currentTime, duration, loaded, toggle, seek, beginScrub, endScrub };
}
