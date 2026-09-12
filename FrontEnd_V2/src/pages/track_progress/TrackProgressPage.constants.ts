import { todayDate } from "@/services/date.service";
import type { ColorKey, GoalCategory, HabitTrackItem, MetricHabitData, SimpleHabitData, TaskTrackItem } from "@/api/types";

export type { WeeklyMatrixRow as MatrixRow } from "@/api/types";

export const TODAY = todayDate();

// ── Data mapping ──────────────────────────────────────────────────────────────

interface BaseTrackSource {
    id: number;
    title: string;
    current_streak: number;
    max_streak: number;
    history: number[];
    color: ColorKey;
    done_today: boolean;
}

function toBaseData(source: BaseTrackSource, category: GoalCategory | null) {
    return {
        id: source.id,
        title: source.title,
        current_streak: source.current_streak,
        max_streak: source.max_streak,
        category,
        history: source.history,
        color: source.color,
        done_today: source.done_today,
    };
}

export function toMetricData(h: HabitTrackItem): MetricHabitData {
    return {
        ...toBaseData(h, h.category),
        value_unit: h.value_unit ?? "",
        planner_target: h.planner_target ?? 1,
        current_value: h.current_value,
    };
}

export function toSimpleData(h: HabitTrackItem): SimpleHabitData {
    return { ...toBaseData(h, h.category), history: h.history.map(v => v > 0) };
}

export function toMetricDataFromTask(t: TaskTrackItem): MetricHabitData {
    return {
        ...toBaseData(t, null),
        value_unit: t.value_unit ?? "",
        planner_target: t.planner_target ?? 1,
        current_value: t.current_value,
    };
}

export function toSimpleDataFromTask(t: TaskTrackItem): SimpleHabitData {
    return { ...toBaseData(t, null), history: t.history.map(v => v > 0) };
}
