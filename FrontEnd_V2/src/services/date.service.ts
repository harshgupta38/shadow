const IST_TIMEZONE = "Asia/Kolkata";

export function todayIso(): string {
    return new Date().toLocaleDateString("en-CA", { timeZone: IST_TIMEZONE });
}

export function todayDate(): Date {
    const [y, m, d] = todayIso().split("-").map(Number);
    return new Date(y, m - 1, d);
}
