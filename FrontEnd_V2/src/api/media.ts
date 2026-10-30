import { ENDPOINTS } from "@/constant/shadow-endpoints";

// Exercise photos and GIFs are served by the backend, so the API sends paths such as "/workout/media/3-4-sit-up/0.jpg".
const MEDIA_PREFIX = `${ENDPOINTS.WORKOUT.PREFIX}/media/`;

/**
 * Puts the API base in front of every media path in a response, the same way endpoint calls are built.
 * The images then load from the backend in development and in production, and the frontend bundle stays small.
 */
export function resolveMediaPaths<T>(value: T, apiBase: string): T {
  if (typeof value === "string") {
    return (value.startsWith(MEDIA_PREFIX) ? `${apiBase}${value}` : value) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => resolveMediaPaths(item, apiBase)) as T;
  }
  // Only plain objects are walked, so a blob from a file download passes through untouched.
  if (value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, resolveMediaPaths(item, apiBase)]),
    ) as T;
  }
  return value;
}
