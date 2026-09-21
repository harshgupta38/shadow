import axios, { type AxiosRequestConfig } from "axios";
import { ENDPOINTS } from "@/constant/bo-endpoints";

// ─── ApiError ────────────────────────────────────────────────────────────────
export class ApiError extends Error {
  status?: number;
  fieldErrors?: Record<string, string>;
  retryAfter?: number;

  constructor(
    message: string,
    status?: number,
    fieldErrors?: Record<string, string>,
    retryAfter?: number,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fieldErrors = fieldErrors;
    this.retryAfter = retryAfter;
  }
}

function normaliseError(err: unknown): ApiError {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    const data = err.response?.data as Record<string, unknown> | undefined;
    const retryAfter = err.response?.headers?.["retry-after"]
      ? Number(err.response.headers["retry-after"])
      : undefined;
    const message =
      (data?.message as string | undefined) ??
      (data?.detail as string | undefined) ??
      err.message ??
      "Something went wrong.";
    const fieldErrors = data?.errors as Record<string, string> | undefined;
    return new ApiError(message, status, fieldErrors, retryAfter);
  }
  if (err instanceof ApiError) return err;
  return new ApiError(
    err instanceof Error ? err.message : "Something went wrong.",
  );
}

// ─── Axios instance ───────────────────────────────────────────────────────────
// Exported for EventSource-based streaming endpoints (LiveLogTail) — axios's
// own baseURL config isn't usable there, since EventSource is a plain
// browser API that just takes a URL string, not an axios request config.
export const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";
const TIMEOUT = Number(import.meta.env.VITE_API_TIMEOUT_SECONDS ?? 30) * 1000;

const PUBLIC_PATHS = [ENDPOINTS.AUTH.LOGIN];

const httpClient = axios.create({
  baseURL: BASE_URL,
  timeout: TIMEOUT,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
    "X-Requested-With": "XMLHttpRequest",
  },
});

httpClient.interceptors.response.use(
  (res) => res,
  (err) => {
    const url: string = (err.config?.url as string) ?? "";
    const isPublic = PUBLIC_PATHS.some((p) => url.includes(p));
    if (err.response?.status === 401 && !isPublic) {
      window.dispatchEvent(new Event("unauthorized"));
    }
    return Promise.reject(normaliseError(err));
  },
);

// ─── Typed HTTP wrapper ───────────────────────────────────────────────────────
export const http = {
  get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return httpClient.get<T>(url, config).then((r) => r.data);
  },
  post<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
    return httpClient.post<T>(url, body, config).then((r) => r.data);
  },
  put<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    return httpClient.put<T>(url, data, config).then((r) => r.data);
  },
  patch<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    return httpClient.patch<T>(url, data, config).then((r) => r.data);
  },
  delete<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
    return httpClient.delete<T>(url, { data: body, ...config }).then((r) => r.data);
  },
};

// GET returning a raw text body (e.g. a PlainTextResponse log tail) instead
// of JSON — a normal http.get<string> would still try to parse JSON.
export function httpText(url: string, config?: AxiosRequestConfig): Promise<string> {
  return httpClient
    .get<string>(url, { ...config, responseType: "text" })
    .then((r) => r.data);
}

// GET returning a binary file body (e.g. a database backup) for the caller
// to save — see downloadBlob() in lib/download.ts for triggering the
// browser's save dialog from the result.
export function httpBlob(url: string, config?: AxiosRequestConfig): Promise<Blob> {
  return httpClient
    .get<Blob>(url, { ...config, responseType: "blob" })
    .then((r) => r.data);
}
