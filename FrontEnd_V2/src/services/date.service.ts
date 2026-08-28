const IST_TIMEZONE = "Asia/Kolkata";

export function todayIso(): string {
    return new Date().toLocaleDateString("en-CA", { timeZone: IST_TIMEZONE });
}
