import {
  AxiosError,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, http, httpClient, tokenStore, UNAUTHORIZED_EVENT } from "./client";

function axiosError(
  status: number | undefined,
  data: unknown,
  code = "ERR_BAD_RESPONSE",
): AxiosError {
  const config = { headers: {} } as InternalAxiosRequestConfig;
  const response =
    status !== undefined
      ? ({ data, status, statusText: "", headers: {}, config } as AxiosResponse)
      : undefined;
  return new AxiosError("request failed", code, config, {}, response);
}

function rejectWith(error: AxiosError) {
  httpClient.defaults.adapter = () => Promise.reject(error);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("tokenStore", () => {
  it("stores, reads and clears the token", () => {
    tokenStore.set("abc.def");
    expect(tokenStore.get()).toBe("abc.def");
    tokenStore.clear();
    expect(tokenStore.get()).toBeNull();
  });
});

describe("error normalisation", () => {
  it("maps a string detail to the message", async () => {
    rejectWith(axiosError(409, { detail: "Email already registered" }));
    await expect(http.post("/auth/register")).rejects.toMatchObject({
      name: "ApiError",
      message: "Email already registered",
      status: 409,
    });
  });

  it("maps FastAPI validation arrays to field errors", async () => {
    rejectWith(
      axiosError(422, {
        detail: [{ loc: ["body", "password"], msg: "too short", type: "value_error" }],
      }),
    );
    try {
      await http.post("/auth/register");
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiError = err as ApiError;
      expect(apiError.fieldErrors).toEqual({ password: "too short" });
      expect(apiError.message).toBe("too short");
    }
  });

  it("produces a friendly message on network errors", async () => {
    rejectWith(axiosError(undefined, undefined, "ERR_NETWORK"));
    await expect(http.get("/dashboard/summary")).rejects.toMatchObject({
      message: expect.stringContaining("Can't reach the server"),
    });
  });

  it("produces a generic message for 500s", async () => {
    rejectWith(axiosError(500, { detail: null }));
    await expect(http.get("/x")).rejects.toMatchObject({
      message: expect.stringContaining("server ran into a problem"),
      status: 500,
    });
  });

  it("emits an unauthorized event on 401", async () => {
    const handler = vi.fn();
    window.addEventListener(UNAUTHORIZED_EVENT, handler);
    rejectWith(axiosError(401, { detail: "Not authenticated" }));
    await expect(http.get("/auth/me")).rejects.toBeInstanceOf(ApiError);
    expect(handler).toHaveBeenCalledTimes(1);
    window.removeEventListener(UNAUTHORIZED_EVENT, handler);
  });
});
