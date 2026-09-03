import { describe, expect, it } from "vitest";
import { evaluateRules, slaBreach } from "../lib/automation/rules";
import type { TriageOutput } from "../lib/ai/classifier";

function base(over: Partial<TriageOutput>): TriageOutput {
  return {
    category: "bug",
    urgency: "medium",
    sentiment: "neutral",
    summary: "s",
    suggestedReply: "r",
    confidence: 0.7,
    aiDegraded: false,
    ...over,
  };
}

describe("evaluateRules", () => {
  it("escalates critical urgency", () => {
    expect(evaluateRules(base({ urgency: "critical" })).newStatus).toBe("escalated");
  });
  it("auto-resolves confident how-to", () => {
    const r = evaluateRules(base({ category: "how-to", urgency: "low", confidence: 0.9 }));
    expect(r.newStatus).toBe("auto-resolved");
    expect(r.actionTaken).toBe("auto-resolved");
  });
  it("keeps low-confidence how-to open", () => {
    expect(
      evaluateRules(base({ category: "how-to", urgency: "low", confidence: 0.5 })).newStatus
    ).toBe("open");
  });
  it("escalates angry high-urgency billing", () => {
    const r = evaluateRules(base({ category: "billing", urgency: "high", sentiment: "angry" }));
    expect(r.newStatus).toBe("escalated");
  });
  it("keeps medium bug open for review", () => {
    const r = evaluateRules(base({ category: "bug", urgency: "medium" }));
    expect(r.newStatus).toBe("open");
    expect(r.actionTaken).toBe("needs-review");
  });
  it("keeps feature request open", () => {
    expect(
      evaluateRules(base({ category: "feature", urgency: "low", sentiment: "happy" })).newStatus
    ).toBe("open");
  });
});

describe("slaBreach", () => {
  it("flags high urgency older than 4h", () => {
    const created = new Date("2026-09-02T08:00:00Z");
    const now = new Date("2026-09-02T13:01:00Z");
    expect(slaBreach(created, "high", now)).toBe(true);
  });
  it("ignores high urgency newer than 4h", () => {
    const created = new Date("2026-09-02T12:30:00Z");
    const now = new Date("2026-09-02T13:00:00Z");
    expect(slaBreach(created, "high", now)).toBe(false);
  });
  it("never flags low urgency even when old", () => {
    const created = new Date("2026-09-01T08:00:00Z");
    const now = new Date("2026-09-02T13:00:00Z");
    expect(slaBreach(created, "low", now)).toBe(false);
  });
});
