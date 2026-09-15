/**
 * Central Axios client for the Shadow backend.
 *
 * Tokens are stored in httpOnly cookies set by the server — this client never
 * reads or writes tokens directly. withCredentials:true ensures the browser
 * includes cookies on every request. On 401 the interceptor triggers a silent
 * /refresh call (which rotates the cookies server-side) and retries the
 * original request.
 *
 * Components never import axios directly — they go through the typed endpoint
 * modules in `src/api/*` which use this client.
 */
import axios, { AxiosError, AxiosInstance, AxiosRequestConfig } from "axios";
import { ApiErrorShape, FieldError } from "@/api/types";
import { ENDPOINTS } from "@/constant/shadow-endpoints";

const REFRESH_URL = `${ENDPOINTS.AUTH.PREFIX}${ENDPOINTS.AUTH.REFRESH}`;

// One-time migration: remove pre-cookie legacy tokens from localStorage
try {
    localStorage.removeItem("shadow.token");
    localStorage.removeItem("shadow.refresh_token");
} catch { /* ignore (private mode, etc.) */ }

// State for coordinating concurrent refresh attempts
let isRefreshing = false;
type PendingItem = { resolve: () => void; reject: (err: unknown) => void };
let pendingQueue: PendingItem[] = [];

function processPendingQueue(error: unknown): void {
    pendingQueue.forEach(({ resolve, reject }) => (error ? reject(error) : resolve()));
    pendingQueue = [];
}

/**
 * POSTs /refresh so the server rotates both cookies atomically.
 * Coordinates concurrent 401s so only one refresh fires at a time.
 * On failure dispatches "unauthorized" to trigger global logout.
 */
export async function refreshAccessToken(): Promise<void> {
    if (isRefreshing) {
        return new Promise<void>((resolve, reject) => {
            pendingQueue.push({ resolve, reject });
        });
    }

    isRefreshing = true;
    try {
        await httpClient.post(REFRESH_URL);
        processPendingQueue(null);
    } catch (err) {
        processPendingQueue(err);
        window.dispatchEvent(new Event("unauthorized"));
        throw err;
    } finally {
        isRefreshing = false;
    }
}

function createClient(): AxiosInstance {
    const baseURL = import.meta.env.VITE_API_BASE_URL ?? "/api";
    const timeoutMs = Number(import.meta.env.VITE_API_TIMEOUT_SECONDS ?? 30) * 1000;

    const instance = axios.create({
        baseURL,
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        timeout: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 30_000,
        withCredentials: true,
    });

    instance.interceptors.response.use(
        (response) => response,
        (error: AxiosError) => {
            if (error.response?.status !== 401) {
                return Promise.reject(normaliseError(error));
            }

            const original = error.config as AxiosRequestConfig & { _retry?: boolean };

            // Already retried once after a refresh — give up and log out
            if (!original || original._retry || original.url === REFRESH_URL) {
                window.dispatchEvent(new Event("unauthorized"));
                return Promise.reject(normaliseError(error));
            }

            original._retry = true;

            return refreshAccessToken()
                .then(() => instance(original))
                .catch(() => Promise.reject(normaliseError(error)));
        },
    );

    return instance;
}

const httpClient = createClient();

export const http = {
    async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
        const response = await httpClient.get<T>(url, config);
        return response.data;
    },
    async post<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
        const response = await httpClient.post<T>(url, body, config);
        return response.data;
    },
    async put<T>(url: string, data?: unknown): Promise<T> {
        const response = await httpClient.put<T>(url, data);
        return response.data;
    },
    async patch<T>(url: string, data?: unknown): Promise<T> {
        const response = await httpClient.patch<T>(url, data);
        return response.data;
    },
    async delete<T>(url: string, body?: unknown): Promise<T> {
        const response = await httpClient.delete<T>(url, body === undefined ? undefined : { data: body });
        return response.data;
    },
};

/**
 * Standard error object used throughout the application.
 *
 * Converts low-level Axios and backend errors into a consistent,
 * user-friendly format that the UI can safely consume.
 */
export class ApiError extends Error implements ApiErrorShape {
    status?: number;
    fieldErrors?: Record<string, string>;
    retryAfter?: number;

    constructor(shape: ApiErrorShape) {
        super(shape.message);
        this.name = "ApiError";
        this.status = shape.status;
        this.fieldErrors = shape.fieldErrors;
        this.retryAfter = shape.retryAfter;
    }
}

function normaliseError(error: unknown): ApiError {
    if (error instanceof ApiError) return error;

    const axiosError = error as AxiosError<unknown>;
    if (!axiosError?.isAxiosError)
        return new ApiError({ message: "Something went wrong. Please try again." });

    const status = axiosError.response?.status;
    const data = axiosError.response?.data as (FieldError & { detail?: string }) | undefined;

    const rawRetryAfter = axiosError.response?.headers?.["retry-after"];
    const retryAfter = rawRetryAfter !== undefined ? parseInt(String(rawRetryAfter), 10) : undefined;
    const validRetryAfter = Number.isFinite(retryAfter) && retryAfter! > 0 ? retryAfter : undefined;

    if (typeof data?.message === "string") {
        return new ApiError({
            message: data.message,
            status,
            fieldErrors: data.errors,
            retryAfter: validRetryAfter,
        });
    }

    if (typeof data?.detail === "string") {
        return new ApiError({ message: data.detail, status, retryAfter: validRetryAfter });
    }

    const fallback = status && status >= 500
        ? "The server ran into a problem. Please try again shortly."
        : "Request failed. Please try again.";
    return new ApiError({ message: fallback, status });
}
