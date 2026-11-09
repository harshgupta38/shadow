import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/api";
import type { CountdownResponse } from "@/api/types";

type Status = "loading" | "ready" | "error";

/** The person's countdowns, loaded once and refreshed on demand (after a save, a note or a task changes the counts). */
export function useCountdowns() {
    const [countdowns, setCountdowns] = useState<CountdownResponse[]>([]);
    const [status, setStatus] = useState<Status>("loading");
    const alive = useRef(true);

    const reload = useCallback(async () => {
        try {
            const list = await api.countdowns.list();
            if (!alive.current) return;
            setCountdowns(list);
            setStatus("ready");
        } catch {
            if (alive.current) setStatus(prev => (prev === "ready" ? prev : "error"));
        }
    }, []);

    useEffect(() => {
        alive.current = true;
        void reload();
        // A tab left open overnight would keep yesterday's days-left, so coming back to it reloads them.
        const onVisible = () => { if (document.visibilityState === "visible") void reload(); };
        document.addEventListener("visibilitychange", onVisible);
        return () => {
            alive.current = false;
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, [reload]);

    return { countdowns, status, reload };
}
