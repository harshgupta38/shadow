/**
 * Read-through cache for GET requests, shared by every page that talks to the API.
 *
 * Built on TanStack's query-core so we get its request de-duplication and expiry for free, but
 * used imperatively from the http client — pages keep calling `api.x.y()` and need no changes.
 *
 * Invalidation is epoch-based: every cache key embeds an epoch number for its group, and clearing
 * a group just bumps that number. Entries under the old epoch become unreachable, while requests
 * already in flight finish normally (removing a query mid-flight would reject its callers) and can
 * never be joined by a request issued after the clear.
 */
import { QueryClient } from "@tanstack/query-core";
import {
    ALL_GROUPS,
    groupsToClearAfterWrite,
    resolveReadRule,
    type CacheGroup,
    type GroupsToClear,
} from "@/api/cache/cachePolicy";

const queryClient = new QueryClient();

let globalEpoch = 0;
const groupEpochs = new Map<CacheGroup, number>();

function epochOf(group: CacheGroup): string {
    return `${globalEpoch}.${groupEpochs.get(group) ?? 0}`;
}

// Callers get their own copy so a page that mutates a response (sorting in place, patching a
// field) can't corrupt what the next page reads from the cache. API payloads are plain JSON.
function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

// Stable text for a request's query params, so {a: 1, b: 2} and {b: 2, a: 1} share an entry and
// unset values don't create duplicates. Returns null for shapes we can't key reliably.
function paramsKey(params: unknown): string | null {
    if (params === undefined || params === null) return "";
    if (typeof params !== "object" || Array.isArray(params) || params instanceof URLSearchParams) return null;
    const entries = Object.entries(params)
        .filter(([, value]) => value !== undefined && value !== null)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return entries.length === 0 ? "" : JSON.stringify(entries);
}

/**
 * Returns the cached response for `url` (plus its query `params`) when it is still fresh,
 * otherwise calls `fetchFresh`. URLs with no read rule (see cachePolicy) go straight to `fetchFresh`.
 */
export async function readThroughCache<T>(url: string, fetchFresh: () => Promise<T>, params?: unknown): Promise<T> {
    const paramsPart = paramsKey(params);
    const rule = paramsPart === null ? null : resolveReadRule(url);
    if (!rule || paramsPart === null) return fetchFresh();

    // Wrapped in an object because query-core rejects `undefined` as query data.
    const entry = await queryClient.fetchQuery({
        queryKey: ["api", rule.group, epochOf(rule.group), url, paramsPart],
        queryFn: async () => ({ data: await fetchFresh() }),
        staleTime: rule.ttlMs,
        // Nothing reads an expired entry, so drop it as soon as it goes stale.
        gcTime: rule.ttlMs,
        retry: false,
    });
    return clone(entry.data);
}

/** Forgets cached responses for the given groups (or all of them). */
function clearApiGroups(groups: GroupsToClear): void {
    const selected = groups === ALL_GROUPS ? null : groups;
    if (selected === null) {
        globalEpoch += 1;
    } else {
        for (const group of selected) groupEpochs.set(group, (groupEpochs.get(group) ?? 0) + 1);
    }

    // Free memory now for entries nothing is waiting on. In-flight ones are left alone (see above)
    // and expire on their own once they finish.
    queryClient.removeQueries({
        predicate: (query) =>
            query.state.fetchStatus === "idle"
            && (selected === null || selected.includes(query.queryKey[1] as CacheGroup)),
    });
}

export function clearApiCache(): void {
    clearApiGroups(ALL_GROUPS);
}

/** Called by the http client after every write, whether it succeeded or failed. */
export function clearCacheAfterWrite(url: string): void {
    clearApiGroups(groupsToClearAfterWrite(url));
}

if (typeof window !== "undefined") {
    // The session is gone, so nothing cached belongs to a signed-in user any more.
    window.addEventListener("unauthorized", clearApiCache);
    // The server just did something on its own (report ready, plan generated, ...), so cached
    // reads may be behind. Registered at import time, so it runs before page listeners that refetch.
    window.addEventListener("shadow:notification", clearApiCache);
}
