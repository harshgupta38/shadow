import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BrightnessHighFill } from "react-bootstrap-icons";

import { api } from "@/api";
import type { DailyBriefResponse } from "@/api/types";
import { PageHeader } from "@/components/ui/PageHeader/PageHeader";

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

// ── Page ──────────────────────────────────────────────────────────────────────

export function DailyBriefPage() {
    const [searchParams] = useSearchParams();
    const dateParam = searchParams.get("date") ?? undefined;
    const displayDate = dateParam ?? todayISTString();

    const [brief, setBrief] = useState<DailyBriefResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setLoading(true);
        setError(null);
        setBrief(null);

        api.notifications.getDailyBrief(dateParam)
            .then(setBrief)
            .catch(() => setError("Could not load the brief. Please try again."))
            .finally(() => setLoading(false));
    }, [dateParam]);

    const subtitle = formatDisplayDate(displayDate);

    // Split complete_brief into paragraphs for rendering
    const paragraphs = brief?.complete_brief
        ? brief.complete_brief.split("\n\n").map(p => p.trim()).filter(Boolean)
        : [];

    return (
        <section className="brief-page">
            <PageHeader
                icon={<BrightnessHighFill size={20} />}
                title="Daily Brief"
                subtitle={subtitle}
            />

            {loading && <Skeleton />}

            {!loading && error && (
                <p className="brief-empty">{error}</p>
            )}

            {!loading && !error && paragraphs.length > 0 && (
                <div className="brief-content">
                    {paragraphs.map((p, i) => (
                        <p key={i} className="brief-paragraph">{p}</p>
                    ))}
                </div>
            )}

            {!loading && !error && paragraphs.length === 0 && (
                <p className="brief-empty">
                    No brief has been generated for this day yet. Open your plan to trigger it.
                </p>
            )}
        </section>
    );
}
