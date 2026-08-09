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
import { ApiErrorShape, FieldError } from "@/api/types";

const TOKEN_STORAGE_KEY = "shadow.token";

function createClient(): AxiosInstance {
    const baseURL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api";

    const instance = axios.create({
        baseURL,
        headers: { "Content-Type": "application/json" },
        timeout: 30000, // milliseconds
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
                // emitUnauthorized(); // TODO
            }
            return Promise.reject(normaliseError(error));
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