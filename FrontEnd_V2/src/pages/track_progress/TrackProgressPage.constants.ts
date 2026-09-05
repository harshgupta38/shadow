import { todayDate } from "@/services/date.service";
import type { HabitTrackItem, MetricHabitData, SimpleHabitData, TaskTrackItem } from "@/api/types";

export const TODAY = todayDate();

// Fixed Sun–Sat week; index matches JS getDay() (0=Sun … 6=Sat)
export const WEEK_DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const TODAY_COL = TODAY.getDay();

function getWeekRange(): string {
    const sunday = new Date(TODAY);
    sunday.setDate(TODAY.getDate() - TODAY.getDay());
    const saturday = new Date(sunday);
    saturday.setDate(sunday.getDate() + 6);
    const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `${fmt(sunday)} – ${fmt(saturday)}, ${saturday.getFullYear()}`;
}

export const WEEK_RANGE = getWeekRange();

// ── Data mapping ──────────────────────────────────────────────────────────────

export function toMetricData(h: HabitTrackItem): MetricHabitData {
    return {
        id: h.id,
        title: h.title,
        value_unit: h.value_unit ?? "",
        planner_target: h.planner_target ?? 1,
        current_streak: h.current_streak,
        max_streak: h.max_streak,
        category: h.category,
        history: h.history,
        color: h.color,
        done_today: h.done_today,
        current_value: h.current_value,
    };
}

export function toSimpleData(h: HabitTrackItem): SimpleHabitData {
    return {
        id: h.id,
        title: h.title,
        current_streak: h.current_streak,
        max_streak: h.max_streak,
        category: h.category,
        history: h.history.map(v => v > 0),
        done_today: h.done_today,
        color: h.color,
    };
}

export function toMetricDataFromTask(t: TaskTrackItem): MetricHabitData {
    return {
        id: t.id,
        title: t.title,
        value_unit: t.value_unit ?? "",
        planner_target: t.planner_target ?? 1,
        current_streak: t.current_streak,
        max_streak: t.max_streak,
        category: null,
        history: t.history,
        color: t.color,
        done_today: t.done_today,
        current_value: t.current_value,
    };
}

export function toSimpleDataFromTask(t: TaskTrackItem): SimpleHabitData {
    return {
        id: t.id,
        title: t.title,
        current_streak: t.current_streak,
        max_streak: t.max_streak,
        category: null,
        history: t.history.map(v => v > 0),
        done_today: t.done_today,
        color: t.color,
    };
}
