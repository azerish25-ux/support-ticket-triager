import { describe, expect, it } from "vitest";
import { shortId, timeAgo } from "../lib/format";

describe("timeAgo", () => {
  it("says just now under a minute", () => {
    expect(timeAgo(new Date("2026-09-02T13:00:00Z"), new Date("2026-09-02T13:00:30Z"))).toBe(
      "just now"
    );
  });
  it("says minutes under an hour", () => {
    expect(timeAgo(new Date("2026-09-02T12:40:00Z"), new Date("2026-09-02T13:00:00Z"))).toBe(
      "20m ago"
    );
  });
  it("says hours under a day", () => {
    expect(timeAgo(new Date("2026-09-02T10:00:00Z"), new Date("2026-09-02T13:00:00Z"))).toBe(
      "3h ago"
    );
  });
  it("shortens ids to last 4 chars", () => {
    expect(shortId("cm1234abcdef")).toBe("#cdef");
  });
});
