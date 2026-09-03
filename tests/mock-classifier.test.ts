import { describe, expect, it } from "vitest";
import { mockClassify } from "../lib/ai/classifier";

describe("mockClassify", () => {
  it("detects billing refund", () => {
    const t = mockClassify({
      subject: "Charged twice",
      body: "I was charged twice for the pro plan, please refund ASAP!!",
      channel: "email",
    });
    expect(t.category).toBe("billing");
    expect(t.urgency).toBe("high");
    expect(t.sentiment).toBe("angry");
  });
  it("detects critical sso outage", () => {
    const t = mockClassify({
      subject: "SSO broken",
      body: "SSO is down for the acme team, nobody can login since this morning",
      channel: "chat",
    });
    expect(t.category).toBe("bug");
    expect(t.urgency).toBe("critical");
  });
  it("detects how-to question", () => {
    const t = mockClassify({
      subject: "API key reset",
      body: "How do i reset my api key? I lost the old one.",
      channel: "email",
    });
    expect(t.category).toBe("how-to");
    expect(t.urgency).toBe("low");
  });
  it("defaults empty-ish input to neutral", () => {
    const t = mockClassify({
      subject: "Hello there",
      body: "Just saying hello, everything looks ok so far.",
      channel: "chat",
    });
    expect(t.sentiment).toBe("neutral");
    expect(t.aiDegraded).toBe(false);
  });
});
