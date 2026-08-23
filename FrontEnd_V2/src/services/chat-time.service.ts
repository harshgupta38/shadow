function utcToIst(utcTime: string): string {
    const date = new Date(utcTime);
    if (Number.isNaN(date.getTime())) return utcTime;
    const istOffset = 5.5 * 60; // IST is UTC+5:30
    const localTime = new Date(date.getTime() + istOffset * 60_000);
    return localTime.toISOString();
} 

export function formatChatTime(createdAt: string): string {
    createdAt = utcToIst(createdAt);

    const date = new Date(createdAt);
    if (Number.isNaN(date.getTime())) return createdAt;

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60_000);

    if (diffMin < 1) return "Just now";
    if (diffMin === 1) return "1 min ago";
    if (diffMin < 60) return `${diffMin}min ago`;

    const hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const period = hours >= 12 ? "pm" : "am";
    const hour12 = hours % 12 || 12;
    const timePart = `${String(hour12).padStart(2, "0")}:${minutes} ${period}`;

    const isSameDate =
        now.getFullYear() === date.getFullYear() &&
        now.getMonth() === date.getMonth() &&
        now.getDate() === date.getDate();

    if (isSameDate) return timePart;

    const month = date.toLocaleString(undefined, { month: "short" });
    const day = String(date.getDate()).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}-${month}-${year} ${timePart}`;
}
