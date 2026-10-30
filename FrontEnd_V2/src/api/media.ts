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

// Photos the page is about to show start downloading once the browser is idle. The browser keeps them under their
// versioned URLs, so the cards draw at once when the user reaches them. Skipped on data-saver and slow connections.
const warming = new Set<HTMLImageElement>();

export function prefetchImages(urls: Array<string | null>): void {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (connection?.saveData || /2g/.test(connection?.effectiveType ?? "")) return;

  const start = () => {
    for (const url of new Set(urls)) {
      if (!url) continue;
      const image = new Image();
      image.decoding = "async";
      const done = () => warming.delete(image);
      image.onload = done;
      image.onerror = done;
      warming.add(image);
      image.src = url;
    }
  };
  if ("requestIdleCallback" in window) window.requestIdleCallback(start);
  else setTimeout(start, 200);
}
