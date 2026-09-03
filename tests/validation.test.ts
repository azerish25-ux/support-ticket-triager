import { describe, expect, it } from "vitest";
import { approveSchema, createTicketSchema } from "../lib/validation/ticket";

describe("createTicketSchema", () => {
  it("accepts a valid ticket", () => {
    const r = createTicketSchema.safeParse({
      subject: "Login is broken",
      body: "Nobody on our team can login since morning.",
      customerName: "Dan",
      channel: "chat",
    });
    expect(r.success).toBe(true);
  });
  it("rejects a short subject", () => {
    const r = createTicketSchema.safeParse({
      subject: "Hi",
      body: "Nobody on our team can login since morning.",
      customerName: "Dan",
      channel: "chat",
    });
    expect(r.success).toBe(false);
  });
  it("rejects an unknown channel", () => {
    const r = createTicketSchema.safeParse({
      subject: "Login is broken",
      body: "Nobody on our team can login since morning.",
      customerName: "Dan",
      channel: "sms",
    });
    expect(r.success).toBe(false);
  });
  it("rejects an oversized body", () => {
    const r = createTicketSchema.safeParse({
      subject: "Login is broken",
      body: "x".repeat(4001),
      customerName: "Dan",
      channel: "chat",
    });
    expect(r.success).toBe(false);
  });
  it("approve defaults action to close", () => {
    expect(approveSchema.parse({})).toEqual({ action: "close" });
  });
});
