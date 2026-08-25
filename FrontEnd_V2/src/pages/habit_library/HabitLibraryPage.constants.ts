import type { FilterState } from "@/api";

export const DEFAULT_FILTERS: FilterState = { status: ["active"], priority: [], frequency: [] };
export const EMPTY_FILTERS: FilterState = { status: [], priority: [], frequency: [] };
export const FILTER_STATUS_OPTIONS = [
    { value: "active", label: "Active" },
    { value: "paused", label: "Paused" },
    { value: "archived", label: "Archived" },
];
