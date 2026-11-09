import { ENDPOINTS } from "@/constant/shadow-endpoints";
import { http } from "@/api/client";
import { withCountdownIds } from "@/api/journal";
import type {
    CountdownCreateRequest,
    CountdownDetailResponse,
    CountdownResponse,
    CountdownUpdateRequest,
    JournalEntryResponse,
} from "@/api/types";

const base = ENDPOINTS.COUNTDOWNS.PREFIX;

export const countdownsApi = {
    async list(): Promise<CountdownResponse[]> {
        return http.get<CountdownResponse[]>(base);
    },

    async get(id: number): Promise<CountdownDetailResponse> {
        return http.get<CountdownDetailResponse>(`${base}${ENDPOINTS.COUNTDOWNS.DETAIL(id)}`);
    },

    async create(data: CountdownCreateRequest): Promise<CountdownDetailResponse> {
        return http.post<CountdownDetailResponse>(base, data);
    },

    async update(id: number, data: CountdownUpdateRequest): Promise<CountdownDetailResponse> {
        return http.patch<CountdownDetailResponse>(`${base}${ENDPOINTS.COUNTDOWNS.DETAIL(id)}`, data);
    },

    async remove(id: number): Promise<void> {
        return http.delete<void>(`${base}${ENDPOINTS.COUNTDOWNS.DETAIL(id)}`);
    },

    /** The journal days tagged to the countdown, newest first. */
    async notes(id: number): Promise<JournalEntryResponse[]> {
        return (await http.get<JournalEntryResponse[]>(`${base}${ENDPOINTS.COUNTDOWNS.NOTES(id)}`)).map(withCountdownIds);
    },
};
