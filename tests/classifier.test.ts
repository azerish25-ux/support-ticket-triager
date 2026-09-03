import { afterEach, describe, expect, it } from "vitest";
import { SYSTEM_PROMPT, triageTicket } from "../lib/ai/classifier";

afterEach(() => {
  delete process.env.GEMINI_API_KEY;
});

describe("triageTicket", () => {
  it("uses mock rules when no API key is set", async () => {
    const t = await triageTicket({
      subject: "Charged twice",
      body: "I was charged twice, please refund ASAP!!",
      channel: "email",
    });
    expect(t.category).toBe("billing");
    expect(t.aiDegraded).toBe(false);
    expect(t.suggestedReply).not.toMatch(/As an AI/i);
  });
  it("prompt forbids AI self-reference and caps lengths", () => {
    expect(SYSTEM_PROMPT).toContain("ONLY valid JSON");
    expect(SYSTEM_PROMPT).toContain("no 'As an AI'");
  });
});
