import { useEffect, useRef } from "react";

import { clearApiCache } from "@/api/cache/apiCache";
import { TIMING } from "@/constant/tuning";

type WakeListener = () => void;

const listeners = new Set<WakeListener>();
let lastTickAt = Date.now();
let heartbeatStarted = false;

function notifyWake() {
    // Cached reads may be arbitrarily old after a sleep; drop them before listeners refetch.
    clearApiCache();
    listeners.forEach((listener) => listener());
}

// A big gap since the last tick means the event loop was paused (device sleep,
// lid close, throttled background tab) rather than just a quick tab switch.
function checkStaleness() {
    const now = Date.now();
    const elapsed = now - lastTickAt;
    lastTickAt = now;
    if (elapsed > TIMING.WAKE_STALE_THRESHOLD_MS) {
        notifyWake();
    }
}

function startHeartbeat() {
    if (heartbeatStarted) return;
    heartbeatStarted = true;
    lastTickAt = Date.now();

    window.setInterval(checkStaleness, TIMING.WAKE_HEARTBEAT_MS);
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") checkStaleness();
    });
    window.addEventListener("focus", checkStaleness);
    window.addEventListener("online", checkStaleness);
}

/**
 * Calls `onWake` whenever the tab resumes after a real sleep/background gap
 * (device sleep, laptop lid close, long-throttled background tab, network
 * reconnect) — not on every ordinary tab switch. Use this to refetch
 * page data that may have gone stale while the device/tab was inactive,
 * e.g. updated from another device.
 *
 * Shares one global heartbeat across all callers (module-level state), so
 * mounting it in many components does not spin up duplicate timers.
 */
export function useWakeRefresh(onWake: WakeListener) {
    const callbackRef = useRef(onWake);
    callbackRef.current = onWake;

    useEffect(() => {
        startHeartbeat();
        const listener: WakeListener = () => callbackRef.current();
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
        };
    }, []);
}
