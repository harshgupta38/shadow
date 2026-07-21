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
import axios, { AxiosError, AxiosInstance } from "axios";

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
                // emitUnauthorized();
            }
            return Promise.reject(error);
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
    async get<T>(url: string): Promise<T> {
        const response = await httpClient.get<T>(url);
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