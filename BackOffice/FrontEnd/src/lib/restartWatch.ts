/**
 * Watching BackOffice restart itself.
 *
 * A deploy or restart of BackOffice kills the very process that would report its result, so the
 * page can't wait for an answer from the job. It watches from the outside instead: requests start
 * failing while the process is down, then succeed again from a new process. That new process
 * identifies itself in /health, which is how a real restart is told apart from a slow response.
 */
import { ApiError } from "@/api";
import type { InstanceHealth } from "@/api";

// How long BackOffice may stay unreachable before the restart is assumed to have failed.
// Matches RECOVERY_TIMEOUT_SECONDS in the backend's services/self_restart.py.
export const RESTART_RECOVERY_TIMEOUT_MS = 30_000;

export type OutageState = "waiting" | "expired";

/**
 * True for a failure that means BackOffice can't be reached: no response at all (the API client
 * turns every network failure into an ApiError with no status) or a gateway error from the proxy
 * in front of it. A 4xx such as an expired login is a different problem, and a bug in our own code
 * is not an outage — neither may be counted as the restart failing.
 */
export function isUnreachable(err: unknown): boolean {
  return err instanceof ApiError && (err.status === undefined || err.status >= 500);
}

/**
 * The /health reading to compare a later one against. A BackOffice that predates process
 * identities answers without an instance_id, which can't identify anything — treat it as unknown.
 */
export function usableInstance(health: InstanceHealth): InstanceHealth | null {
  return health.instance_id ? health : null;
}

/** Tracks one stretch of BackOffice being unreachable. */
export function createRestartWatch(timeoutMs = RESTART_RECOVERY_TIMEOUT_MS) {
  let downSince: number | null = null;

  return {
    /** A request to BackOffice failed. */
    failed(): OutageState {
      if (downSince === null) downSince = Date.now();
      return Date.now() - downSince >= timeoutMs ? "expired" : "waiting";
    },
    /** A request succeeded. True when that ends an outage, i.e. BackOffice just came back. */
    succeeded(): boolean {
      const wasDown = downSince !== null;
      downSince = null;
      return wasDown;
    },
    secondsDown(): number {
      return downSince === null ? 0 : Math.round((Date.now() - downSince) / 1000);
    },
  };
}

export function waitingMessage(secondsDown: number): string {
  const limit = Math.round(RESTART_RECOVERY_TIMEOUT_MS / 1000);
  return `BackOffice is restarting — waiting for it to come back (${secondsDown}s of ${limit}s)…`;
}

export function expiredMessage(): string {
  const limit = Math.round(RESTART_RECOVERY_TIMEOUT_MS / 1000);
  return `BackOffice did not answer for ${limit} seconds — assuming the restart failed. `
    + "Check backoffice.log and control.log on the host.";
}

/** What the new process's /health proves, given what the old process reported before the restart. */
export function describeRestart(before: InstanceHealth | null, after: InstanceHealth | null): string {
  if (after === null || !after.instance_id) {
    return "BackOffice is back, but its process details could not be read, so the restart is unconfirmed.";
  }
  if (before !== null && before.instance_id === after.instance_id) {
    return "BackOffice answered again, but it is the same process as before — it did not restart.";
  }
  const startedAt = new Date(after.started_at).toLocaleTimeString();
  const previous = before ? ` (previous process ${before.instance_id.slice(0, 8)})` : "";
  return `Restart confirmed — BackOffice is back as a new process ${after.instance_id.slice(0, 8)}, started at ${startedAt}${previous}.`;
}
