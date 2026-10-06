/**
 * What the API read cache stores, for how long, and which writes empty it.
 *
 * Reads are an allowlist: a GET that matches no rule is never cached. Writes are the opposite —
 * an unrecognised write clears everything, so forgetting to register a new endpoint here costs
 * speed, never correctness.
 */
import { CACHE_TTL } from "@/constant/tuning";
import { ENDPOINTS } from "@/constant/shadow-endpoints";

export type CacheGroup =
    | "dashboard"
    | "profile"
    | "goals"
    | "milestones"
    | "tasks"
    | "habits"
    | "schedule"
    | "track"
    | "planner"
    | "reports"
    | "daily-brief"
    | "settings";

export interface ReadRule {
    group: CacheGroup;
    ttlMs: number;
}

type Matcher = (path: string) => boolean;

const exact = (target: string): Matcher => (path) => path === target;
const under = (prefix: string): Matcher => (path) => path === prefix || path.startsWith(`${prefix}/`);

const E = ENDPOINTS;

// Order matters only where matchers overlap; none do today.
const READ_RULES: Array<{ matches: Matcher; rule: ReadRule }> = [
    { matches: exact(E.DASHBOARD.PREFIX),   rule: { group: "dashboard", ttlMs: CACHE_TTL.SHORT_MS } },
    { matches: under(E.PROFILE.PREFIX),     rule: { group: "profile",   ttlMs: CACHE_TTL.STANDARD_MS } },
    { matches: under(E.GOALS.PREFIX),       rule: { group: "goals",     ttlMs: CACHE_TTL.STANDARD_MS } },
    { matches: under(E.MILESTONES.PREFIX),  rule: { group: "milestones", ttlMs: CACHE_TTL.STANDARD_MS } },
    { matches: under(E.TASKS.PREFIX),       rule: { group: "tasks",     ttlMs: CACHE_TTL.STANDARD_MS } },
    { matches: under(E.HABITS.PREFIX),      rule: { group: "habits",    ttlMs: CACHE_TTL.STANDARD_MS } },
    { matches: under(E.SCHEDULE.PREFIX),    rule: { group: "schedule",  ttlMs: CACHE_TTL.STANDARD_MS } },
    { matches: under(E.TRACK_PROGRESS.PREFIX), rule: { group: "track",  ttlMs: CACHE_TTL.SHORT_MS } },
    { matches: under(E.PLAN_ITEMS.PREFIX),  rule: { group: "planner",   ttlMs: CACHE_TTL.SHORT_MS } },
    { matches: under(E.REPORTS.PREFIX),     rule: { group: "reports",   ttlMs: CACHE_TTL.STANDARD_MS } },
    // Only the brief itself: its audio and captions are large and the server already stores them.
    { matches: exact(`${E.DAILY_BRIEF.PREFIX}${E.DAILY_BRIEF.DETAIL}`), rule: { group: "daily-brief", ttlMs: CACHE_TTL.LONG_MS } },
    // Exact paths only: the settings prefix also hosts exports, key tests and health checks.
    { matches: exact(E.SETTINGS.PREFIX),    rule: { group: "settings",  ttlMs: CACHE_TTL.SETTINGS_MS } },
    { matches: exact(`${E.SETTINGS.PREFIX}${E.SETTINGS.MEMORIES_COUNT}`), rule: { group: "settings", ttlMs: CACHE_TTL.SETTINGS_MS } },
    { matches: exact(`${E.SETTINGS.PREFIX}${E.SETTINGS.AI_PROVIDERS}`),   rule: { group: "settings", ttlMs: CACHE_TTL.STATIC_MS } },
];

/** Journal, notifications, chat and auth are deliberately absent: they are volatile or self-managed. */
export function resolveReadRule(url: string): ReadRule | null {
    const path = stripQuery(url);
    return READ_RULES.find(({ matches }) => matches(path))?.rule ?? null;
}

/** Everything derived from habits, tasks, plans and goals — most writes touch most of it. */
const PLAN_DATA_GROUPS: CacheGroup[] = [
    "dashboard", "profile", "goals", "milestones", "tasks", "habits",
    "schedule", "track", "planner", "reports", "daily-brief",
];

export const ALL_GROUPS = "all" as const;
export type GroupsToClear = CacheGroup[] | typeof ALL_GROUPS;

const A = E.AUTH;
const ACCOUNT_BOUNDARY_PATHS = new Set([
    `${A.PREFIX}${A.LOGIN}`,
    `${A.PREFIX}${A.REGISTER}`,
    `${A.PREFIX}${A.LOGOUT}`,
    `${A.PREFIX}${A.ACCOUNT}`,
    `${A.PREFIX}${A.DEACTIVATE}`,
    `${A.PREFIX}${A.RESET_PASSWORD}`,
]);

/** Which cached groups a successful or failed write can have changed. */
export function groupsToClearAfterWrite(url: string): GroupsToClear {
    const path = stripQuery(url);

    const planDataPrefixes = [
        E.GOALS.PREFIX, E.MILESTONES.PREFIX, E.TASKS.PREFIX, E.HABITS.PREFIX, E.SCHEDULE.PREFIX,
        E.TRACK_PROGRESS.PREFIX, E.PLAN_ITEMS.PREFIX, E.JOURNAL.PREFIX,
    ];
    if (planDataPrefixes.some((prefix) => under(prefix)(path))) return PLAN_DATA_GROUPS;

    if (under(E.REPORTS.PREFIX)(path))     return ["reports", "dashboard", "profile", "planner"];
    if (under(E.DAILY_BRIEF.PREFIX)(path)) return ["daily-brief", "planner"];
    if (under(E.PROFILE.PREFIX)(path))     return ["profile", "dashboard"];
    // Chat spends AI quota (profile usage) and creates memories (settings count).
    if (under(E.CHAT.PREFIX)(path))        return ["profile", "settings"];
    // Nothing cached depends on notifications.
    if (under(E.NOTIFICATIONS.PREFIX)(path)) return [];

    if (under(E.SETTINGS.PREFIX)(path)) {
        // Saving settings changes week start, theme and planner behaviour everywhere.
        // Sub-routes (key tests, health checks, chat-history clearing) only touch their own data.
        return exact(E.SETTINGS.PREFIX)(path) ? ALL_GROUPS : ["settings", "profile"];
    }

    if (under(A.PREFIX)(path)) {
        if (ACCOUNT_BOUNDARY_PATHS.has(path)) return ALL_GROUPS;
        if (path === `${A.PREFIX}${A.NAME}`) return ["profile", "dashboard"];
        return [];
    }

    return ALL_GROUPS;
}

function stripQuery(url: string): string {
    const queryStart = url.indexOf("?");
    return queryStart === -1 ? url : url.slice(0, queryStart);
}
