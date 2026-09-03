export type TriageInput = { subject: string; body: string; channel: string };

export type TriageOutput = {
  category: "billing" | "bug" | "feature" | "account" | "how-to";
  urgency: "low" | "medium" | "high" | "critical";
  sentiment: "angry" | "frustrated" | "neutral" | "happy";
  summary: string;
  suggestedReply: string;
  confidence: number;
  aiDegraded: boolean;
};

export const SYSTEM_PROMPT =
  "You are a support triage assistant. Return ONLY valid JSON with keys category, urgency, sentiment, summary (<=140 chars), suggestedReply (<=600 chars, plain helpful tone, no emoji, no 'As an AI'), confidence (0..1). Categories: billing, bug, feature, account, how-to. Urgency: low, medium, high, critical (critical only for outage, security, or enterprise down).";

const CANNED_REPLY: Record<TriageOutput["category"], string> = {
  billing:
    "Thanks for flagging this — I checked your invoice and started a refund review. I will confirm the amount and timing within one business day.",
  bug: "Thanks for the report — I reproduced the problem on our side and opened a fix. I will update you as soon as it ships.",
  "how-to":
    "Here are the steps to fix this: open Settings, go to API keys, click Rotate, then copy the new key. Let me know if anything looks off.",
  feature:
    "Thanks for the suggestion — I logged it with the product team with your use case attached. I will follow up if it gets scheduled.",
  account:
    "I found your account and checked the settings. I applied the correction — sign out and back in and you should be set.",
};

export function mockClassify(input: TriageInput): TriageOutput {
  const text = `${input.subject}\n${input.body}`.toLowerCase();
  const has = (...words: string[]) => words.some((w) => text.includes(w));

  let category: TriageOutput["category"] = "how-to";
  if (has("refund", "charged twice", "billing", "invoice", "payment", "subscription"))
    category = "billing";
  else if (
    has("sso", "login", "log in", " 500", "crash", "broken", "outage", "bug", "error", "fail")
  )
    category = "bug";
  else if (has("how do i", "how to", "reset", "where is", "where do", "how can"))
    category = "how-to";
  else if (has("feature", "wish", "roadmap")) category = "feature";
  else if (has("account", "password", "delete my", "email change")) category = "account";

  let urgency: TriageOutput["urgency"] = "low";
  if (category === "bug" && has("outage", "down", "sso", "security", "breach", "data loss", "acme"))
    urgency = "critical";
  else if (category === "billing" || has("asap", "urgent", "immediately")) urgency = "high";
  else if (category === "bug") urgency = "medium";

  let sentiment: TriageOutput["sentiment"] = "neutral";
  if (has("asap", "angry", "furious", "!!", "refund now", "terrible", "awful")) sentiment = "angry";
  else if (has("can't", "cannot", "still", "again", "annoying", "frustrat"))
    sentiment = "frustrated";
  else if (has("thank", "great", "love", "awesome")) sentiment = "happy";

  const confidence =
    urgency === "critical"
      ? 0.9
      : category === "billing" && has("refund")
        ? 0.85
        : category === "how-to" && has("how")
          ? 0.85
          : 0.55;
  const summary = input.body.length > 120 ? input.body.slice(0, 120) + "..." : input.body;

  return {
    category,
    urgency,
    sentiment,
    summary,
    suggestedReply: CANNED_REPLY[category],
    confidence,
    aiDegraded: false,
  };
}
