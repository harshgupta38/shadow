import { describe, expect, it } from "vitest";

import {
  clampPercent,
  compactNumber,
  dueLabel,
  formatMetricValue,
  formatMinutes,
  greeting,
  initials,
  relativeTime,
  toISODate,
} from "./format";

describe("toISODate", () => {
  it("formats a date as local YYYY-MM-DD", () => {
    expect(toISODate(new Date(2026, 6, 1))).toBe("2026-07-01");
    expect(toISODate(new Date(2026, 0, 9))).toBe("2026-01-09");
  });
});

describe("initials", () => {
  it("derives up to two initials from a name", () => {
    expect(initials("Ada Lovelace")).toBe("AL");
    expect(initials("Ada")).toBe("AD");
    expect(initials("  ")).toBe("?");
    expect(initials("mary jane watson")).toBe("MW");
  });
});

describe("compactNumber", () => {
  it("keeps small integers as-is and compacts large numbers", () => {
    expect(compactNumber(42)).toBe("42");
    expect(compactNumber(1500)).toBe("1.5K");
  });
});

describe("formatMinutes", () => {
  it("renders hours and minutes", () => {
    expect(formatMinutes(45)).toBe("45m");
    expect(formatMinutes(60)).toBe("1h");
    expect(formatMinutes(160)).toBe("2h 40m");
  });
});

describe("formatMetricValue", () => {
  it("formats minutes specially and counts plainly", () => {
    expect(formatMetricValue(160, "minutes")).toBe("2h 40m");
    expect(formatMetricValue(3, "count")).toBe("3");
    expect(formatMetricValue(2, "hours")).toBe("2h");
  });
});

describe("clampPercent", () => {
  it("clamps to the 0–100 range and rounds", () => {
    expect(clampPercent(-10)).toBe(0);
    expect(clampPercent(150)).toBe(100);
    expect(clampPercent(49.6)).toBe(50);
  });
});

describe("relativeTime", () => {
  it("returns 'just now' for the current moment", () => {
    expect(relativeTime(new Date())).toBe("just now");
  });
  it("returns minutes and hours ago", () => {
    expect(relativeTime(new Date(Date.now() - 5 * 60_000))).toBe("5m ago");
    expect(relativeTime(new Date(Date.now() - 3 * 3_600_000))).toBe("3h ago");
  });
});

describe("dueLabel", () => {
  it("labels relative due dates", () => {
    const today = new Date();
    const tomorrow = new Date(Date.now() + 24 * 3_600_000);
    const yesterday = new Date(Date.now() - 24 * 3_600_000);
    expect(dueLabel(today)).toBe("Due today");
    expect(dueLabel(tomorrow)).toBe("Due tomorrow");
    expect(dueLabel(yesterday)).toBe("Overdue by 1d");
    expect(dueLabel(null)).toBeNull();
  });
});

describe("greeting", () => {
  it("greets by time of day", () => {
    expect(greeting(new Date(2026, 6, 1, 9))).toBe("Good morning");
    expect(greeting(new Date(2026, 6, 1, 14))).toBe("Good afternoon");
    expect(greeting(new Date(2026, 6, 1, 20))).toBe("Good evening");
  });
});
