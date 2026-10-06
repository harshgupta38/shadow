import { http } from "./client";
import { ENDPOINTS } from "@/constant/bo-endpoints";
import type { InstanceHealth } from "./types";

// Kept short: while BackOffice restarts, a hung request is just as much "not back yet"
// as a refused one, and the caller counts failures against a fixed recovery window.
const HEALTH_TIMEOUT_MS = 4000;

export const systemApi = {
  async health(): Promise<InstanceHealth> {
    return http.get<InstanceHealth>(ENDPOINTS.SYSTEM.health, { timeout: HEALTH_TIMEOUT_MS });
  },
};
