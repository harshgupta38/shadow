/**
 * Central Axios client for the Shadow backend.
 *
 * - Attaches the JWT bearer token to every request.
 * - Normalises backend / FastAPI error payloads into a consistent `ApiError`.
 * - Emits an `unauthorized` event so the auth layer can log the user out on 401.
 *
 * Components never import axios directly — they go through the typed endpoint
 * modules in `src/api/*` which use this client.
 */
import axios, { AxiosError, AxiosInstance, AxiosRequestConfig } from "axios";
import { ApiErrorShape, FieldError, TokenResponse } from "@/api/types";

const TOKEN_STORAGE_KEY = "shadow.token";
const REFRESH_TOKEN_KEY = "shadow.refresh_token";

// State for coordinating concurrent refresh attempts
let isRefreshing = false;
type PendingItem = { resolve: (token: string) => void; reject: (err: unknown) => void };
let pendingQueue: PendingItem[] = [];

function processPendingQueue(error: unknown, token: string | null): void {
    pendingQueue.forEach(({ resolve, reject }) => (error ? reject(error) : resolve(token!)));
    pendingQueue = [];
}

function createClient(): AxiosInstance {
    const baseURL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api";
    const timeoutMs = Number(import.meta.env.VITE_API_TIMEOUT_SECONDS ?? 30) * 1000;

    const instance = axios.create({
        baseURL,
        headers: { "Content-Type": "application/json" },
        timeout: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 30_000,
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
            if (error.response?.status !== 401) {
                return Promise.reject(normaliseError(error));
            }

            const original = error.config as AxiosRequestConfig & { _retry?: boolean };

            // Already retried once after a refresh — don't loop
            if (!original || original._retry || original.url === "/auth/refresh") {
                tokenStore.clear();
                tokenStore.clearRefreshToken();
                window.dispatchEvent(new Event("unauthorized"));
                return Promise.reject(normaliseError(error));
            }

            const refreshToken = tokenStore.getRefreshToken();
            if (!refreshToken) {
                window.dispatchEvent(new Event("unauthorized"));
                return Promise.reject(normaliseError(error));
            }

            // Another refresh is in flight — queue this request to retry once it resolves
            if (isRefreshing) {
                return new Promise<string>((resolve, reject) => {
                    pendingQueue.push({ resolve, reject });
                }).then((token) => {
                    if (original.headers) original.headers["Authorization"] = `Bearer ${token}`;
                    return instance(original);
                }).catch(() => Promise.reject(normaliseError(error)));
            }

            original._retry = true;
            isRefreshing = true;

            return new Promise((resolve, reject) => {
                instance
                    .post<TokenResponse>("/auth/refresh", { refresh_token: refreshToken })
                    .then(({ data }) => {
                        tokenStore.set(data.access_token);
                        tokenStore.setRefreshToken(data.refresh_token);
                        processPendingQueue(null, data.access_token);
                        if (original.headers) original.headers["Authorization"] = `Bearer ${data.access_token}`;
                        resolve(instance(original));
                    })
                    .catch((err) => {
                        processPendingQueue(err, null);
                        tokenStore.clear();
                        tokenStore.clearRefreshToken();
                        window.dispatchEvent(new Event("unauthorized"));
                        reject(normaliseError(error));
                    })
                    .finally(() => {
                        isRefreshing = false;
                    });
            });
        },
    );

    return instance;
}

/**
 * Axios HTTP client for making API requests to our private server
 * Contains necessary data not needed while calling third party APIs
 */
const httpClient = createClient();

/**
 * Plain HTTP client for making API requests to any third party server
 */
export const http = {
    async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
        const response = await httpClient.get<T>(url, config);
        return response.data;
    },
    async post<T>(url: string, body?: unknown): Promise<T> {
        const response = await httpClient.post<T>(url, body);
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
 * Token store for managing JWT tokens in localStorage
 * Provides methods to get, set, and clear the token
 * Handles errors gracefully (e.g., private mode, storage errors)
 */
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
    getRefreshToken(): string | null {
        try {
            return localStorage.getItem(REFRESH_TOKEN_KEY);
        } catch {
            return null;
        }
    },
    setRefreshToken(token: string): void {
        try {
            localStorage.setItem(REFRESH_TOKEN_KEY, token);
        } catch {
            /* ignore storage errors (private mode, etc.) */
        }
    },
    clearRefreshToken(): void {
        try {
            localStorage.removeItem(REFRESH_TOKEN_KEY);
        } catch {
            /* noop */
        }
    },
};

/**
 * Standard error object used throughout the application.
 *
 * Converts low-level Axios and backend errors into a consistent,
 * user-friendly format that the UI can safely consume.
 *
 * Every API request throws an `ApiError`, allowing pages to handle
 * errors without knowing about Axios or backend response formats.
 */
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
    if (!axiosError?.isAxiosError)
        return new ApiError({ message: "Something went wrong. Please try again." });

    const status = axiosError.response?.status;
    const data = axiosError.response?.data as FieldError | undefined;

    if (typeof data?.message === "string") {
        return new ApiError({
            message: data.message,
            status,
            fieldErrors: data.errors,
        });
    }

    const fallback = status && status >= 500 ? "The server ran into a problem. Please try again shortly." : "Request failed. Please try again.";
    return new ApiError({ message: fallback, status });
}