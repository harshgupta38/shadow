const IST_TIMEZONE = "Asia/Kolkata";

export function todayIso(): string {
    return new Date().toLocaleDateString("en-CA", { timeZone: IST_TIMEZONE });
}

export function todayDate(): Date {
    const [y, m, d] = todayIso().split("-").map(Number);
    return new Date(y, m - 1, d);
}

export function relativeTime(iso: string): string {
    const diffMs = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diffMs / 60_000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    const wks = Math.floor(days / 7);
    if (wks < 5) return `${wks}w ago`;
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function notifTime(iso: string): string {
    const date = new Date(iso);
    const diffMs = Date.now() - date.getTime();
    const mins = Math.floor(diffMs / 60_000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 12) return `${hrs} hr${hrs === 1 ? "" : "s"} ago`;
    const time = date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: IST_TIMEZONE });
    const day = date.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric", timeZone: IST_TIMEZONE });
    return `${time}, ${day}`;
}
