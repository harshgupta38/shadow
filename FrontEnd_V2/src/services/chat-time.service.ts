export function formatMessageTime(createdAt: string): string {
    const diffMin = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60_000);
    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin} min`;
    return new Date(createdAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", timeZoneName: "short" });
}
