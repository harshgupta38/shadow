/**
 * Central Axios client for the Jarvis backend.
 *
 * - Attaches the JWT bearer token to every request.
 * - Normalises backend / FastAPI error payloads into a consistent `ApiError`.
 * - Emits an `unauthorized` event so the auth layer can log the user out on 401.
 *
 * Components never import axios directly — they go through the typed endpoint
 * modules in `src/api/*` which use this client.
 */
import axios, { AxiosError, type AxiosInstance } from "axios";

import type { ApiErrorShape } from "./types";

const TOKEN_STORAGE_KEY = "jarvis.token";

// ── Token storage (single source of truth for the JWT) ─────────────────────
export const tokenStore = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_STORAGE_KEY);
    } catch {
      return null;
    }
  },
  set(token: string): void {
    try {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } catch {
      /* ignore storage errors (private mode, etc.) */
    }
  },
  clear(): void {
    try {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    } catch {
      /* noop */
    }
  },
};

// ── Unauthorized broadcast (decouples the client from React state) ─────────
export const UNAUTHORIZED_EVENT = "jarvis:unauthorized";
function emitUnauthorized(): void {
  window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
}

// ── A normalised, user-safe error object ───────────────────────────────────
export class ApiError extends Error implements ApiErrorShape {
  status?: number;
  fieldErrors?: Record<string, string>;

  constructor(shape: ApiErrorShape) {
    super(shape.message);
    this.name = "ApiError";
    this.status = shape.status;
    this.fieldErrors = shape.fieldErrors;
  }
}

/** Convert an unknown thrown value into a friendly `ApiError`. */
function normaliseError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  const axiosError = error as AxiosError<unknown>;
  if (!axiosError?.isAxiosError) {
    return new ApiError({ message: "Something went wrong. Please try again." });
  }

  if (axiosError.code === "ERR_NETWORK") {
    return new ApiError({
      message: "Can't reach the server. Check your connection and try again.",
    });
  }

  const status = axiosError.response?.status;
  const data = axiosError.response?.data as
    | { detail?: unknown }
    | undefined;

  // FastAPI validation errors → { detail: [{ loc, msg, type }] }
  if (Array.isArray(data?.detail)) {
    const fieldErrors: Record<string, string> = {};
    let firstMsg = "Please check the highlighted fields.";
    for (const item of data.detail as Array<{ loc?: unknown[]; msg?: string }>) {
      const field = Array.isArray(item.loc) ? String(item.loc[item.loc.length - 1]) : "";
      const msg = item.msg ?? "Invalid value";
      if (field) fieldErrors[field] = msg;
      if (firstMsg === "Please check the highlighted fields.") firstMsg = msg;
    }
    return new ApiError({ message: firstMsg, status, fieldErrors });
  }

  // Service errors → { detail: "message" }
  if (typeof data?.detail === "string") {
    return new ApiError({ message: data.detail, status });
  }

  const fallback =
    status && status >= 500
      ? "The server ran into a problem. Please try again shortly."
      : "Request failed. Please try again.";
  return new ApiError({ message: fallback, status });
}

// ── The configured instance ────────────────────────────────────────────────
function createClient(): AxiosInstance {
  const baseURL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api";

  const instance = axios.create({
    baseURL,
    headers: { "Content-Type": "application/json" },
    timeout: 30_000,
  });

  instance.interceptors.request.use((config) => {
    const token = tokenStore.get();
    if (token) {
      config.headers.set("Authorization", `Bearer ${token}`);
    }
    return config;
  });

  instance.interceptors.response.use(
    (response) => response,
    (error: AxiosError) => {
      if (error.response?.status === 401) {
        emitUnauthorized();
      }
      return Promise.reject(normaliseError(error));
    },
  );

  return instance;
}

export const httpClient = createClient();

/** Thin helpers so endpoint modules stay terse and consistent. */
export const http = {
  async get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
    const { data } = await httpClient.get<T>(url, { params });
    return data;
  },
  async post<T>(url: string, body?: unknown): Promise<T> {
    const { data } = await httpClient.post<T>(url, body);
    return data;
  },
  async put<T>(url: string, body?: unknown): Promise<T> {
    const { data } = await httpClient.put<T>(url, body);
    return data;
  },
  async patch<T>(url: string, body?: unknown): Promise<T> {
    const { data } = await httpClient.patch<T>(url, body);
    return data;
  },
  async del(url: string): Promise<void> {
    await httpClient.delete(url);
  },
};
