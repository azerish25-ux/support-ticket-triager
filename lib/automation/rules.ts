import type { TriageOutput } from "../ai/classifier";

export type RuleResult = {
  newStatus: "escalated" | "auto-resolved" | "open";
  actionTaken: string;
};

export function evaluateRules(t: TriageOutput): RuleResult {
  if (t.urgency === "critical") return { newStatus: "escalated", actionTaken: "escalated" };
  if (t.category === "how-to" && t.confidence >= 0.8)
    return { newStatus: "auto-resolved", actionTaken: "auto-resolved" };
  if (t.category === "billing" && t.urgency === "high" && t.sentiment === "angry")
    return { newStatus: "escalated", actionTaken: "escalated" };
  return { newStatus: "open", actionTaken: "needs-review" };
}

export function slaBreach(createdAt: Date, urgency: string, now: Date = new Date()): boolean {
  if (urgency !== "high" && urgency !== "critical") return false;
  return now.getTime() - createdAt.getTime() > 4 * 3600 * 1000;
}
