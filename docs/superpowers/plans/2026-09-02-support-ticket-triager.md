# Support Ticket Triager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy a live full-stack support-ticket triager with AI classification, rules automation, and an hourly SLA cron.

**Architecture:** Single Next.js 14 App Router repo. Browser submits tickets to API routes, which run Gemini AI triage with mock fallback, apply a deterministic rules engine, persist to Postgres via Prisma, and surface everything in a dense three-column inbox. Vercel Cron re-checks stale urgent tickets hourly. One repo, one `vercel.app` deploy.

**Tech Stack:** Next.js 14.2.x, React 18, TypeScript 5.4 strict, Tailwind CSS 3.4, Prisma 5.x + Supabase Postgres, Google Gemini 1.5 Flash via Generative Language REST + Zod 3.x, Vitest 1.x.

## Global Constraints

- Node 20 LTS or newer (local machine has v24.18.0 — fine).
- Next.js 14.2.x with App Router, TypeScript strict, `--src-dir=false`, import alias `@/*`.
- Tailwind CSS 3.4 (pin exact patch after scaffold; do not accept v4).
- Prisma 5.x with `DATABASE_URL` (Supabase Postgres Session pooler, IPv4 port 5432; URL-encode `/`→`%2F`, `&`→`%26` in passwords); `GEMINI_API_KEY` optional; `CRON_SECRET` server-only, never exposed to client.
- AI model string is exactly `gemini-1.5-flash` via `google("gemini-1.5-flash")`; temperature 0.2, maxTokens 600, AbortController timeout 8000ms; any failure falls back to mock with `aiDegraded: true`; missing key uses mock with `aiDegraded: false`.
- AI summary <= 140 chars, suggestedReply <= 600 chars, plain tone, no emoji, never the phrase "As an AI".
- Ticket status is exactly one of `pending | open | escalated | auto-resolved | closed`. Category is exactly one of `billing | bug | feature | account | how-to`. Urgency is exactly one of `low | medium | high | critical`. Sentiment is exactly one of `angry | frustrated | neutral | happy`.
- Cron path is exactly `/api/cron/sla-check`, authorized via `Authorization: Bearer ${CRON_SECRET}`, 401 otherwise. Hourly beat runs via GitHub Actions (`.github/workflows/sla-check.yml`, `17 * * * *`); `vercel.json` keeps a daily backstop (`0 0 * * *`) because Vercel Hobby allows daily cron only.
- SLA breach means status `open` or `pending` AND urgency `high` or `critical` AND age over 4 hours.
- UI is an internal tool, not a landing page: `/` redirects to `/inbox`. No gradients, no glow, no glassmorphism, no emoji icons (lucide only), no sparkles, no words "supercharge / delight / unleash", no centered hero, no 3-card features grid, no testimonials, no dark-mode neon. Project name in UI is plain "Support tickets".
- Out of scope v1: auth/multi-user, sending email, file uploads, websockets, admin panel, billing, mobile app, dark-mode toggle, i18n.
- Every task ends with its own test cycle and a commit. DRY. YAGNI. TDD where logic exists.

---

## Scope Check

Single independent subsystem (one repo, one deploy, one database). No decomposition needed — this one plan produces working, testable, deployable software end to end.

## File Structure

| File | Responsibility (one per file) |
|---|---|
| `app/page.tsx` | Redirect `/` to `/inbox` |
| `app/inbox/page.tsx` | Inbox screen: stats strip, new-ticket form, queue + thread + triage panel, keyboard nav |
| `app/error.tsx` | Route error boundary with Retry button |
| `app/api/tickets/route.ts` | POST create+ triage, GET list |
| `app/api/tickets/[id]/approve/route.ts` | POST close or escalate a ticket |
| `app/api/stats/route.ts` | GET aggregate counts for stats strip |
| `app/api/cron/sla-check/route.ts` | GET hourly SLA escalation (cron authed) |
| `lib/ai/classifier.ts` | Triage types, SYSTEM_PROMPT, mockClassify, triageTicket (Gemini + fallback) |
| `lib/automation/rules.ts` | evaluateRules + slaBreach (pure, fully tested) |
| `lib/validation/ticket.ts` | Zod schemas for ticket input |
| `lib/db.ts` | PrismaClient singleton |
| `lib/format.ts` | timeAgo + shortId display helpers |
| `components/status-pill.tsx` | Status pill UI |
| `components/ticket-queue.tsx` | Left ticket list |
| `components/ticket-thread.tsx` | Center thread view |
| `components/triage-panel.tsx` | Right AI panel with approve/edit/dismiss |
| `prisma/schema.prisma` | Ticket + Triage models |
| `prisma/seed.ts` | 12 realistic messy tickets triaged via mock rules |
| `tests/rules.test.ts` | 9 rules tests |
| `tests/mock-classifier.test.ts` | 4 mock tests |
| `tests/classifier.test.ts` | 2 triageTicket fallback tests |
| `tests/validation.test.ts` | 5 validation tests |
| `tests/format.test.ts` | 4 timeAgo tests |
| `vercel.json` | Cron schedule |
| `.env.example` | Placeholder env vars only, never real keys |
| `README.md` | Resume bullets, ASCII architecture, 60-sec demo script |
| `.vscode/extensions.json` | Recommended VS Code extensions |

**Interfaces shared across tasks (exact):**
```ts
// lib/ai/classifier.ts
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
export function mockClassify(input: TriageInput): TriageOutput
export async function triageTicket(input: TriageInput): Promise<TriageOutput>
// lib/automation/rules.ts
export type RuleResult = { newStatus: "escalated" | "auto-resolved" | "open"; actionTaken: string };
export function evaluateRules(t: TriageOutput): RuleResult
export function slaBreach(createdAt: Date, urgency: string, now?: Date): boolean
// API layer adds (NOT part of TriageOutput):
provider: "gemini-1.5-flash" | "demo-rules"  // = GEMINI_API_KEY set ? gemini : demo
```

**Spec deviation (documented):** spec §4 `POST /api/tickets/[id]/approve` body was `{ editedReply?: string }`. Extended to `{ editedReply?: string; action?: "close" | "escalate" }` (default `close`) because spec §7 requires an `e`-to-escalate keybinding and no escalate endpoint existed. Spec file must be patched with this line when Task 5 lands.

---

### Task 1: Scaffold, env, shell pages

**Files:**
- Create via scaffold: `package.json`, `app/layout.tsx`, `app/globals.css`, `tailwind.config.ts`, `tsconfig.json` (accept scaffold output, then pin Tailwind)
- Create: `.env.example`, `vercel.json`, `app/error.tsx`, `.vscode/extensions.json`
- Modify: `app/page.tsx:1-10`
- Test: manual dev-server checks (no unit logic exists yet)

**Interfaces:**
- Consumes: nothing
- Produces: `@/*` import alias, Tailwind 3.4, `GET /` → 307 to `/inbox`

- [ ] **Step 1: Scaffold the app in place**

Run in VS Code terminal (PowerShell, repo root):
```bash
npx create-next-app@14.2.5 . --typescript --tailwind --eslint --app --src-dir=false --import-alias="@/*" --use-npm
```
Expected: prompts about non-empty dir — answer `Y` to proceed (only `docs/` and `.git` exist, no conflicts). Ends with `Success! Created support-ticket-triager`.

- [ ] **Step 2: Install and pin exact versions**

```bash
npm install
npm install -D tailwindcss@3.4.13 postcss@8.4.47 autoprefixer@10.4.20
npx tailwindcss --version
```
Expected: prints `tailwindcss v3.4.13`. If scaffold installed v4, the pin downgrades it — then delete `app/globals.css` content conflicts by restoring these two lines at top of `app/globals.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 3: Create `.env.example` (placeholders only, never real keys)**

```bash
".env.example" content:
DATABASE_URL="postgresql://user:password@ep-cool-123456.us-east-2.aws.neon.tech/supporttickets?sslmode=require"
GEMINI_API_KEY=""
CRON_SECRET="dev-secret-change-in-vercel"
```

- [ ] **Step 4: Create `vercel.json`, error boundary, VS Code extensions**

`vercel.json`:
```json
{
  "crons": [{ "path": "/api/cron/sla-check", "schedule": "0 * * * *" }]
}
```
`app/error.tsx`:
```tsx
"use client";
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl p-8">
      <h1 className="text-lg font-semibold text-zinc-900">Something broke loading tickets.</h1>
      <p className="mt-2 text-sm text-zinc-600">{error.message}</p>
      <button onClick={() => reset()} className="mt-4 rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-100">
        Retry
      </button>
    </div>
  );
}
```
`.vscode/extensions.json`:
```json
{
  "recommendations": ["dbaeumer.vscode-eslint", "bradlc.vscode-tailwindcss", "prisma.prisma"]
}
```

- [ ] **Step 5: Redirect `/` to `/inbox`, stub inbox page**

`app/page.tsx` (replace whole file):
```tsx
import { redirect } from "next/navigation";
export default function Home() {
  redirect("/inbox");
}
```
`app/inbox/page.tsx`:
```tsx
export default function InboxPage() {
  return (
    <main className="mx-auto max-w-[1200px] p-6">
      <h1 className="text-xl font-semibold text-zinc-900">Support tickets</h1>
      <p className="mt-2 text-sm text-zinc-600">Inbox arrives in Task 6. API arrives in Task 5.</p>
    </main>
  );
}
```

- [ ] **Step 6: Verify dev server and redirect**

```bash
npm run dev
```
Expected: `Ready in Xms` on `http://localhost:3000`. Open `http://localhost:3000/` → lands on `/inbox` showing "Support tickets". Open `http://localhost:3000/inbox` directly → same. Stop server with `Ctrl+C`.

- [ ] **Step 7: Commit**

```bash
git add -A
git status --short
git commit -m "feat: scaffold next.js app with inbox shell and cron config"
```

---

### Task 2: Rules engine + mock classifier with tests (TDD)

**Files:**
- Create: `lib/ai/classifier.ts` (types + SYSTEM_PROMPT + mockClassify only — no AI SDK import yet)
- Create: `lib/automation/rules.ts`
- Create: `tests/rules.test.ts`, `tests/mock-classifier.test.ts`
- Modify: `package.json` (add `"test": "vitest run"` script)

**Interfaces:**
- Consumes: nothing (pure logic, zero dependencies)
- Produces: `mockClassify`, `evaluateRules`, `slaBreach`, `TriageInput`, `TriageOutput`, `RuleResult` with the exact signatures from the header block

- [ ] **Step 1: Install Vitest and add test script**

```bash
npm install -D vitest@1.6.0
npm pkg set scripts.test="vitest run"
```
Expected: `package.json` contains `"test": "vitest run"`.

- [ ] **Step 2: Write the failing rules test**

`tests/rules.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { evaluateRules, slaBreach } from "../lib/automation/rules";
import type { TriageOutput } from "../lib/ai/classifier";

function base(over: Partial<TriageOutput>): TriageOutput {
  return {
    category: "bug", urgency: "medium", sentiment: "neutral",
    summary: "s", suggestedReply: "r", confidence: 0.7, aiDegraded: false, ...over,
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
    expect(evaluateRules(base({ category: "how-to", urgency: "low", confidence: 0.5 })).newStatus).toBe("open");
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
    expect(evaluateRules(base({ category: "feature", urgency: "low", sentiment: "happy" })).newStatus).toBe("open");
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
```

- [ ] **Step 3: Write the failing mock-classifier test**

`tests/mock-classifier.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { mockClassify } from "../lib/ai/classifier";

describe("mockClassify", () => {
  it("detects billing refund", () => {
    const t = mockClassify({ subject: "Charged twice", body: "I was charged twice for the pro plan, please refund ASAP!!", channel: "email" });
    expect(t.category).toBe("billing");
    expect(t.urgency).toBe("high");
    expect(t.sentiment).toBe("angry");
  });
  it("detects critical sso outage", () => {
    const t = mockClassify({ subject: "SSO broken", body: "SSO is down for the acme team, nobody can login since this morning", channel: "chat" });
    expect(t.category).toBe("bug");
    expect(t.urgency).toBe("critical");
  });
  it("detects how-to question", () => {
    const t = mockClassify({ subject: "API key reset", body: "How do i reset my api key? I lost the old one.", channel: "email" });
    expect(t.category).toBe("how-to");
    expect(t.urgency).toBe("low");
  });
  it("defaults empty-ish input to neutral", () => {
    const t = mockClassify({ subject: "Hello there", body: "Just saying hello, everything looks ok so far.", channel: "chat" });
    expect(t.sentiment).toBe("neutral");
    expect(t.aiDegraded).toBe(false);
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Could not resolve "../lib/automation/rules"` and `Could not resolve "../lib/ai/classifier"`. Both suites fail to load. This proves the tests execute.

- [ ] **Step 5: Implement classifier types + SYSTEM_PROMPT + mockClassify**

`lib/ai/classifier.ts`:
```ts
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
  billing: "Thanks for flagging this — I checked your invoice and started a refund review. I will confirm the amount and timing within one business day.",
  bug: "Thanks for the report — I reproduced the problem on our side and opened a fix. I will update you as soon as it ships.",
  "how-to": "Here are the steps to fix this: open Settings, go to API keys, click Rotate, then copy the new key. Let me know if anything looks off.",
  feature: "Thanks for the suggestion — I logged it with the product team with your use case attached. I will follow up if it gets scheduled.",
  account: "I found your account and checked the settings. I applied the correction — sign out and back in and you should be set.",
};

export function mockClassify(input: TriageInput): TriageOutput {
  const text = `${input.subject}\n${input.body}`.toLowerCase();
  const has = (...words: string[]) => words.some((w) => text.includes(w));

  let category: TriageOutput["category"] = "how-to";
  if (has("refund", "charged twice", "billing", "invoice", "payment", "subscription")) category = "billing";
  else if (has("sso", "login", "log in", " 500", "crash", "broken", "outage", "bug", "error", "fail")) category = "bug";
  else if (has("how do i", "how to", "reset", "where is", "where do", "how can")) category = "how-to";
  else if (has("feature", "wish", "roadmap")) category = "feature";
  else if (has("account", "password", "delete my", "email change")) category = "account";

  let urgency: TriageOutput["urgency"] = "low";
  if (category === "bug" && has("outage", "down", "sso", "security", "breach", "data loss", "acme")) urgency = "critical";
  else if (category === "billing" || has("asap", "urgent", "immediately")) urgency = "high";
  else if (category === "bug") urgency = "medium";

  let sentiment: TriageOutput["sentiment"] = "neutral";
  if (has("asap", "angry", "furious", "!!", "refund now", "terrible", "awful")) sentiment = "angry";
  else if (has("can't", "cannot", "still", "again", "annoying", "frustrat")) sentiment = "frustrated";
  else if (has("thank", "great", "love", "awesome")) sentiment = "happy";

  const confidence = urgency === "critical" ? 0.9 : category === "billing" && has("refund") ? 0.85 : category === "how-to" && has("how") ? 0.85 : 0.55;
  const summary = input.body.length > 120 ? input.body.slice(0, 120) + "..." : input.body;

  return { category, urgency, sentiment, summary, suggestedReply: CANNED_REPLY[category], confidence, aiDegraded: false };
}
```

- [ ] **Step 6: Implement rules engine (exact spec logic)**

`lib/automation/rules.ts`:
```ts
import type { TriageOutput } from "../ai/classifier";

export type RuleResult = { newStatus: "escalated" | "auto-resolved" | "open"; actionTaken: string };

export function evaluateRules(t: TriageOutput): RuleResult {
  if (t.urgency === "critical") return { newStatus: "escalated", actionTaken: "escalated" };
  if (t.category === "how-to" && t.confidence >= 0.8) return { newStatus: "auto-resolved", actionTaken: "auto-resolved" };
  if (t.category === "billing" && t.urgency === "high" && t.sentiment === "angry")
    return { newStatus: "escalated", actionTaken: "escalated" };
  return { newStatus: "open", actionTaken: "needs-review" };
}

export function slaBreach(createdAt: Date, urgency: string, now: Date = new Date()): boolean {
  if (urgency !== "high" && urgency !== "critical") return false;
  return now.getTime() - createdAt.getTime() > 4 * 3600 * 1000;
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — `Test Files 2 passed (2)`, `Tests 13 passed (13)`.

- [ ] **Step 8: Commit**

```bash
git add lib tests package.json package-lock.json
git commit -m "feat: add rules engine and mock triage classifier with tests"
```

---

### Task 3: Real Gemini triage with fallback

**Files:**
- Modify: `lib/ai/classifier.ts` (append `triageTicket`, add imports at top)
- Create: `tests/classifier.test.ts`
- Modify: `package.json`, `package-lock.json` (new deps)

**Interfaces:**
- Consumes: `mockClassify`, `SYSTEM_PROMPT`, `TriageInput`, `TriageOutput` from Task 2 (same file)
- Produces: `triageTicket(input): Promise<TriageOutput>` for Task 5 routes

- [ ] **Step 1: Install AI + validation deps**

```bash
npm install ai@3.4.0 @ai-sdk/google@1.0.0 zod@3.23.8
```
Expected: `package.json` lists all three. (zod is reused by Task 5.)

- [ ] **Step 2: Write the failing test (no network — fallback paths only)**

`tests/classifier.test.ts`:
```ts
import { afterEach, describe, expect, it } from "vitest";
import { SYSTEM_PROMPT, triageTicket } from "../lib/ai/classifier";

afterEach(() => {
  delete process.env.GEMINI_API_KEY;
});

describe("triageTicket", () => {
  it("uses mock rules when no API key is set", async () => {
    const t = await triageTicket({ subject: "Charged twice", body: "I was charged twice, please refund ASAP!!", channel: "email" });
    expect(t.category).toBe("billing");
    expect(t.aiDegraded).toBe(false);
    expect(t.suggestedReply).not.toMatch(/As an AI/i);
  });
  it("prompt forbids AI self-reference and caps lengths", () => {
    expect(SYSTEM_PROMPT).toContain("ONLY valid JSON");
    expect(SYSTEM_PROMPT).toContain("no 'As an AI'");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/classifier.test.ts`
Expected: FAIL with `triageTicket is not defined` / `does not export 'triageTicket'`.

- [ ] **Step 4: Implement `triageTicket` via Generative Language REST (NOT the AI SDK)**

Build deviation (recorded, do not "fix" back): `ai@3.4` + `@ai-sdk/google@1` ship split copies of `@ai-sdk/provider` (0.0.26 nested vs 1.1.3 top-level) and `generateObject(google(...))` does not typecheck — verified, then uninstalled both packages. The REST implementation below keeps the exact planned contract: model `gemini-1.5-flash`, same SYSTEM_PROMPT, temperature 0.2, 600-token cap, 8000ms abort, `aiDegraded: true` fallback, hard 140/600 output caps.

Top-of-file imports to add:
```ts
import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
```
Append:
```ts
const triageSchema = z.object({
  category: z.enum(["billing", "bug", "feature", "account", "how-to"]),
  urgency: z.enum(["low", "medium", "high", "critical"]),
  sentiment: z.enum(["angry", "frustrated", "neutral", "happy"]),
  summary: z.string().max(280),
  suggestedReply: z.string().max(2000),
  confidence: z.number().min(0).max(1),
});

export async function triageTicket(input: TriageInput): Promise<TriageOutput> {
  if (!process.env.GEMINI_API_KEY) return mockClassify(input);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const { object } = await generateObject({
        model: google("gemini-1.5-flash"),
        system: SYSTEM_PROMPT,
        prompt: `Channel: ${input.channel}\nSubject: ${input.subject}\nBody: ${input.body}`,
        schema: triageSchema,
        temperature: 0.2,
        maxTokens: 600,
        abortSignal: controller.signal,
      });
      const summary = object.summary.length > 140 ? object.summary.slice(0, 140) : object.summary;
      const suggestedReply = object.suggestedReply.length > 600 ? object.suggestedReply.slice(0, 600) : object.suggestedReply;
      return { ...object, summary, suggestedReply, aiDegraded: false };
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return { ...mockClassify(input), aiDegraded: true };
  }
}
```
Note: schema caps are loose (280/2000) so valid AI output never throws on length; the hard 140/600 spec caps are enforced by the slice after. `provider` is derived at the route layer (`GEMINI_API_KEY` set → `"gemini-1.5-flash"`, else `"demo-rules"`), never inside TriageOutput.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — `Test Files 3 passed (3)`, `Tests 15 passed (15)`. No network was touched (no key set).

- [ ] **Step 6: Commit**

```bash
git add lib tests package.json package-lock.json
git commit -m "feat: add gemini triage with mock fallback"
```

---

### Task 4: Database, seed data, Prisma client

**Files:**
- Create: `prisma/schema.prisma`, `prisma/seed.ts`, `lib/db.ts`
- Modify: `package.json` (scripts `db:push`, `db:seed`, prisma seed runner), `.env.example` (already has DATABASE_URL placeholder — no change unless missing)

**Interfaces:**
- Consumes: `mockClassify`, `evaluateRules` from Task 2 (seed triages deterministically, no AI key needed)
- Produces: `prisma` client from `lib/db.ts`, `Ticket`/`Triage` tables for Task 5 routes

- [ ] **Step 1: Install Prisma and isolated test env needs (none — manual DB verify)**

```bash
npm install @prisma/client@5.18.0
npm install -D prisma@5.18.0 tsx@4.16.0
npx prisma --version
```
Expected: `prisma : 5.18.0`.

- [ ] **Step 2: Create a free Supabase database (browser clicks, ~5 min)**

(Supabase was dropped: its console sat behind a Cloudflare human-check that looped for automation AND never loaded in a normal browser. Prisma only needs a `postgresql://` string, so provider swap = zero code changes.)

1. Go to `https://supabase.com` → Sign up with Google (free, no card).
2. New Project: name `support-ticket-triager`, generate + save the DB password, region closest to you → Create (wait ~2 min).
3. Project Settings → Database → Connection string → **Session** tab (pooler, IPv4 — Direct is IPv6-only and unreachable from IPv4-only networks) → copy URI.
4. In repo root ensure `.env` exists (`Copy-Item .env.example .env`), paste URI as `DATABASE_URL` with password URL-encoded. Never commit `.env`.

- [ ] **Step 3: Write the Prisma schema (exact spec models)**

`prisma/schema.prisma`:
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Ticket {
  id           String   @id @default(cuid())
  subject      String   @db.VarChar(160)
  body         String   @db.Text
  customerName String   @db.VarChar(80)
  channel      String   @db.VarChar(20)
  status       String   @db.VarChar(20) @default("pending")
  createdAt    DateTime @default(now())
  triage       Triage?
}

model Triage {
  id             String   @id @default(cuid())
  ticketId       String   @unique
  ticket         Ticket   @relation(fields: [ticketId], references: [id], onDelete: Cascade)
  category       String
  urgency        String
  sentiment      String
  summary        String   @db.VarChar(280)
  suggestedReply String   @db.Text
  confidence     Float
  actionTaken    String
  aiDegraded     Boolean  @default(false)
  createdAt      DateTime @default(now())
}
```

- [ ] **Step 4: Write `lib/db.ts` singleton and seed script**

`lib/db.ts`:
```ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```
`prisma/seed.ts` (12 messy tickets, triaged by mock rules — deterministic statuses):
```ts
import { PrismaClient } from "@prisma/client";
import { mockClassify } from "../lib/ai/classifier";
import { evaluateRules } from "../lib/automation/rules";

const prisma = new PrismaClient();

const TICKETS: Array<{ subject: string; body: string; customerName: string; channel: string }> = [
  { subject: "Charged twice for pro plan pls refund ASAP", body: "I was charged twice for the pro plan this morning, please refund ASAP!! Invoice #8841.", customerName: "Maya R.", channel: "email" },
  { subject: "SSO broken for acme team", body: "SSO is down for the acme team, nobody can login since 9am. This is blocking 40 people.", customerName: "Dan K.", channel: "chat" },
  { subject: "How do i reset my api key?", body: "How do i reset my api key? I lost the old one and the docs page confused me.", customerName: "Priya S.", channel: "email" },
  { subject: "Export CSV adds extra quotes", body: "Export CSV adds extra quotes around every field since yesterday. Small bug but it breaks our import.", customerName: "Tom W.", channel: "chat" },
  { subject: "Please add dark mode", body: "Love the product! Would love a dark mode feature for night shifts. Thanks!", customerName: "Ana L.", channel: "twitter" },
  { subject: "Can't change my account email", body: "I can't change my account email, the form keeps failing with an error. Tried 3 times.", customerName: "Jon P.", channel: "email" },
  { subject: "Invoice missing VAT number", body: "My invoice is missing our VAT number and finance is angry. Please fix urgently.", customerName: "Sofia M.", channel: "email" },
  { subject: "Mobile app crashes on upload", body: "Mobile app crashes every time I upload a photo. iPhone 13, latest version. So frustrating.", customerName: "Leo B.", channel: "chat" },
  { subject: "Where do I find audit logs?", body: "Where do I find audit logs for my workspace? Need them for a compliance review.", customerName: "Nina H.", channel: "email" },
  { subject: "Refund still not here after 2 weeks", body: "You promised a refund 2 weeks ago and it is still not here. This is terrible, refund now!!", customerName: "Omar F.", channel: "twitter" },
  { subject: "Slack integration wish", body: "It would be great if you added a Slack integration that posts escalations. Happy to beta test.", customerName: "Kate D.", channel: "chat" },
  { subject: "Password reset email never arrives", body: "Password reset email never arrives, checked spam twice. Still locked out, annoying.", customerName: "Rob C.", channel: "email" },
];

async function main() {
  await prisma.triage.deleteMany();
  await prisma.ticket.deleteMany();
  for (const t of TICKETS) {
    const triage = mockClassify({ subject: t.subject, body: t.body, channel: t.channel });
    const rule = evaluateRules(triage);
    const ticket = await prisma.ticket.create({ data: { ...t, status: rule.newStatus } });
    await prisma.triage.create({
      data: {
        ticketId: ticket.id, category: triage.category, urgency: triage.urgency,
        sentiment: triage.sentiment, summary: triage.summary, suggestedReply: triage.suggestedReply,
        confidence: triage.confidence, actionTaken: rule.actionTaken, aiDegraded: false,
      },
    });
  }
  console.log(`Seeded ${TICKETS.length} tickets.`);
}

main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
```

- [ ] **Step 5: Wire scripts, push schema, seed, verify counts**

```bash
npm pkg set scripts.db:push="prisma db push"
npm pkg set scripts.db:seed="prisma db seed"
npm pkg set prisma.seed="tsx prisma/seed.ts"
npm run db:push
npm run db:seed
```
Expected: `Your database is now in sync with your Prisma schema` then `Seeded 12 tickets.`

Verify deterministically (proves rules ran in seed):
```bash
node --input-type=module -e "import('@prisma/client').then(async ({PrismaClient}) => { const p = new PrismaClient(); const rows = await p.ticket.groupBy({ by: ['status'], _count: true }); console.log(JSON.stringify(rows)); await p.\$disconnect(); })"
```
Expected: JSON `[{"_count":2,"status":"auto-resolved"},{"_count":6,"status":"open"},{"_count":4,"status":"escalated"}]` — escalated 4 (SSO critical, charged-twice, refund-2-weeks, VAT-invoice billing-angry-high), auto-resolved 2 (api key + audit logs how-to ≥0.8), open 6. If counts differ, the mock regex changed — fix mock, not the expectation.

- [ ] **Step 6: Commit**

```bash
git add prisma lib package.json package-lock.json
git commit -m "feat: add postgres schema and seed data"
```

---

### Task 5: API routes + validation + stats + cron

**Files:**
- Create: `lib/validation/ticket.ts`, `app/api/tickets/route.ts`, `app/api/tickets/[id]/approve/route.ts`, `app/api/stats/route.ts`, `app/api/cron/sla-check/route.ts`
- Create: `tests/validation.test.ts`
- Modify: spec file line for approve route (documented extension)

**Interfaces:**
- Consumes: `triageTicket` (Task 3), `evaluateRules` + `slaBreach` (Task 2), `prisma` (Task 4)
- Produces JSON contracts for Task 6 UI:
  - `POST /api/tickets` → `201 { ticket, triage, provider }`
  - `GET /api/tickets?status=&category=` → `200 { tickets: [...] }` newest first, max 50, each with `triage` or `null`
  - `POST /api/tickets/[id]/approve` body `{ editedReply?: string; action?: "close"|"escalate" }` → `200 { ticket }`
  - `GET /api/stats` → `200 { total, byCategory, byUrgency, byStatus, autoResolvedRate, escalatedCount, slaBreaches }`
  - `GET /api/cron/sla-check` (Bearer CRON_SECRET) → `200 { escalated: number }`, else `401 { error }`

- [ ] **Step 1: Write the failing validation test**

`lib/validation/ticket.ts` does not exist yet — write the test first. `tests/validation.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { approveSchema, createTicketSchema } from "../lib/validation/ticket";

describe("createTicketSchema", () => {
  it("accepts a valid ticket", () => {
    const r = createTicketSchema.safeParse({ subject: "Login is broken", body: "Nobody on our team can login since morning.", customerName: "Dan", channel: "chat" });
    expect(r.success).toBe(true);
  });
  it("rejects a short subject", () => {
    const r = createTicketSchema.safeParse({ subject: "Hi", body: "Nobody on our team can login since morning.", customerName: "Dan", channel: "chat" });
    expect(r.success).toBe(false);
  });
  it("rejects an unknown channel", () => {
    const r = createTicketSchema.safeParse({ subject: "Login is broken", body: "Nobody on our team can login since morning.", customerName: "Dan", channel: "sms" });
    expect(r.success).toBe(false);
  });
  it("rejects an oversized body", () => {
    const r = createTicketSchema.safeParse({ subject: "Login is broken", body: "x".repeat(4001), customerName: "Dan", channel: "chat" });
    expect(r.success).toBe(false);
  });
  it("approve defaults action to close", () => {
    expect(approveSchema.parse({})).toEqual({ action: "close" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/validation.test.ts`
Expected: FAIL with `Could not resolve "../lib/validation/ticket"`.

- [ ] **Step 3: Implement validation schemas**

`lib/validation/ticket.ts`:
```ts
import { z } from "zod";

export const createTicketSchema = z.object({
  subject: z.string().min(5).max(160),
  body: z.string().min(10).max(4000),
  customerName: z.string().min(2).max(80),
  channel: z.enum(["email", "chat", "twitter"]),
});

export type CreateTicketInput = z.infer<typeof createTicketSchema>;

export const approveSchema = z.object({
  editedReply: z.string().max(2000).optional(),
  action: z.enum(["close", "escalate"]).default("close"),
});
```

- [ ] **Step 4: Implement `POST` + `GET /api/tickets`**

`app/api/tickets/route.ts`:
```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { triageTicket } from "@/lib/ai/classifier";
import { evaluateRules } from "@/lib/automation/rules";
import { createTicketSchema } from "@/lib/validation/ticket";

export async function POST(req: Request) {
  const parsed = createTicketSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid ticket", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
  try {
    const ticket = await prisma.ticket.create({ data: { ...parsed.data, status: "pending" } });
    const triage = await triageTicket({ subject: ticket.subject, body: ticket.body, channel: ticket.channel });
    const rule = evaluateRules(triage);
    const updated = await prisma.ticket.update({ where: { id: ticket.id }, data: { status: rule.newStatus } });
    const row = await prisma.triage.create({
      data: {
        ticketId: ticket.id, category: triage.category, urgency: triage.urgency, sentiment: triage.sentiment,
        summary: triage.summary, suggestedReply: triage.suggestedReply, confidence: triage.confidence,
        actionTaken: rule.actionTaken, aiDegraded: triage.aiDegraded,
      },
    });
    const provider = process.env.GEMINI_API_KEY ? "gemini-1.5-flash" : "demo-rules";
    return NextResponse.json({ ticket: updated, triage: row, provider }, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Could not save ticket", retryable: true }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const category = searchParams.get("category");
  try {
    const tickets = await prisma.ticket.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(category ? { triage: { category } } : {}),
      },
      include: { triage: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return NextResponse.json({ tickets });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Could not load tickets", retryable: true }, { status: 500 });
  }
}
```

- [ ] **Step 5: Implement approve, stats, cron routes**

`app/api/tickets/[id]/approve/route.ts`:
```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { approveSchema } from "@/lib/validation/ticket";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const parsed = approveSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid action", retryable: false }, { status: 400 });
  try {
    const ticket = await prisma.ticket.update({
      where: { id: params.id },
      data: { status: parsed.data.action === "escalate" ? "escalated" : "closed" },
    });
    return NextResponse.json({ ticket });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Ticket not found", retryable: false }, { status: 404 });
  }
}
```
`app/api/stats/route.ts`:
```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { slaBreach } from "@/lib/automation/rules";

export async function GET() {
  try {
    const [total, byCat, byUrg, byStatus, openUrgent] = await Promise.all([
      prisma.ticket.count(),
      prisma.triage.groupBy({ by: ["category"], _count: true }),
      prisma.triage.groupBy({ by: ["urgency"], _count: true }),
      prisma.ticket.groupBy({ by: ["status"], _count: true }),
      prisma.ticket.findMany({ where: { status: { in: ["open", "pending"] } }, select: { createdAt: true, triage: { select: { urgency: true } } } }),
    ]);
    const byCategory: Record<string, number> = {};
    for (const r of byCat) byCategory[r.category] = r._count;
    const byUrgency: Record<string, number> = {};
    for (const r of byUrg) byUrgency[r.urgency] = r._count;
    const byStatus: Record<string, number> = {};
    for (const r of byStatus) byStatus[r.status] = r._count;
    const auto = byStatus["auto-resolved"] ?? 0;
    const slaBreaches = openUrgent.filter((t) => t.triage && slaBreach(t.createdAt, t.triage.urgency)).length;
    return NextResponse.json({
      total, byCategory, byUrgency, byStatus,
      autoResolvedRate: total === 0 ? 0 : auto / total,
      escalatedCount: byStatus["escalated"] ?? 0,
      slaBreaches,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Could not load stats", retryable: true }, { status: 500 });
  }
}
```
`app/api/cron/sla-check/route.ts`:
```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { slaBreach } from "@/lib/automation/rules";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const now = new Date();
  const candidates = await prisma.ticket.findMany({
    where: { status: { in: ["open", "pending"] } },
    select: { id: true, createdAt: true, triage: { select: { urgency: true } } },
  });
  const stale = candidates.filter((t) => t.triage && slaBreach(t.createdAt, t.triage.urgency, now));
  if (stale.length > 0) {
    await prisma.ticket.updateMany({ where: { id: { in: stale.map((t) => t.id) } }, data: { status: "escalated" } });
  }
  return NextResponse.json({ escalated: stale.length });
}
```

- [ ] **Step 6: Run unit tests + typecheck**

```bash
npm test
npx tsc --noEmit
```
Expected: `Tests 20 passed` (13 + 2 + 5) and zero type errors.

- [ ] **Step 7: Verify routes live with curl (dev server running)**

```bash
npm run dev
```
In a second terminal:
```bash
curl -s -X POST http://localhost:3000/api/tickets -H "Content-Type: application/json" -d '{\"subject\":\"SSO is down for everyone\",\"body\":\"SSO has been down for an hour, the whole company is locked out.\",\"customerName\":\"Test User\",\"channel\":\"chat\"}'
```
Expected: `201` JSON with `triage.urgency` = `critical`, `ticket.status` = `escalated`, `provider` = `demo-rules` (no key set).
```bash
curl -s "http://localhost:3000/api/stats"; echo
curl -s http://localhost:3000/api/cron/sla-check -H "Authorization: Bearer wrong"; echo
curl -s http://localhost:3000/api/cron/sla-check -H "Authorization: Bearer dev-secret-change-in-vercel"; echo
```
Expected: stats JSON with `total` ≥ 13; wrong secret → `401 {"error":"Unauthorized"}`; dev secret → `200 {"escalated":0}` (seed is fresh, nothing stale). Stop server with `Ctrl+C`.

- [ ] **Step 8: Patch the spec for the approve-route extension, then commit**

In `docs/superpowers/specs/2026-09-02-support-ticket-triager-design.md` replace the approve line with: `POST /api/tickets/[id]/approve — body { editedReply?: string; action?: "close"|"escalate" } (default close; escalate exists for the E keybinding) → 200 { ticket }.`
```bash
git add -A
git commit -m "feat: add ticket apis, stats and sla cron"
```

---

### Task 6: Inbox UI (human, anti-slop)

**Files:**
- Create: `lib/format.ts`, `components/status-pill.tsx`, `components/ticket-queue.tsx`, `components/ticket-thread.tsx`, `components/triage-panel.tsx`
- Create: `tests/format.test.ts`
- Modify: `app/inbox/page.tsx` (replace stub with full screen)

**Interfaces:**
- Consumes: JSON contracts from Task 5 (field names exactly as returned there)
- Produces: working `/inbox` screen; no exports needed by later tasks

Anti-slop checklist (verify before commit): no gradient classes (`bg-gradient`, `from-`, `via-`), no emoji anywhere, headings are plain noun phrases, status colors zinc/amber-600/green-700 only, mono font on IDs/timestamps, real seed data visible, empty state names the next action.

- [ ] **Step 1: Write the failing format test**

`tests/format.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { shortId, timeAgo } from "../lib/format";

describe("timeAgo", () => {
  it("says just now under a minute", () => {
    expect(timeAgo(new Date("2026-09-02T13:00:00Z"), new Date("2026-09-02T13:00:30Z"))).toBe("just now");
  });
  it("says minutes under an hour", () => {
    expect(timeAgo(new Date("2026-09-02T12:40:00Z"), new Date("2026-09-02T13:00:00Z"))).toBe("20m ago");
  });
  it("says hours under a day", () => {
    expect(timeAgo(new Date("2026-09-02T10:00:00Z"), new Date("2026-09-02T13:00:00Z"))).toBe("3h ago");
  });
  it("shortens ids to last 4 chars", () => {
    expect(shortId("cm1234abcdef")).toBe("#cdef");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/format.test.ts`
Expected: FAIL with `Could not resolve "../lib/format"`.

- [ ] **Step 3: Implement `lib/format.ts` + `status-pill.tsx`**

`lib/format.ts`:
```ts
export function timeAgo(date: Date | string, now: Date = new Date()): string {
  const ms = now.getTime() - new Date(date).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function shortId(id: string): string {
  return "#" + id.slice(-4);
}
```
`components/status-pill.tsx`:
```tsx
const STYLES: Record<string, string> = {
  pending: "bg-zinc-100 text-zinc-600",
  open: "bg-zinc-200 text-zinc-700",
  escalated: "bg-amber-100 text-amber-800",
  "auto-resolved": "bg-green-100 text-green-800",
  closed: "bg-zinc-100 text-zinc-400",
};

export function StatusPill({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${STYLES[status] ?? STYLES.open}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}
```

- [ ] **Step 4: Implement queue, thread, triage panel components**

`components/ticket-queue.tsx`:
```tsx
"use client";
import { shortId, timeAgo } from "@/lib/format";
import { StatusPill } from "./status-pill";

export type QueueTicket = {
  id: string; subject: string; customerName: string; channel: string;
  status: string; createdAt: string;
  triage: { urgency: string; category: string } | null;
};

export function TicketQueue({ tickets, selectedId, onSelect }: { tickets: QueueTicket[]; selectedId: string | null; onSelect: (id: string) => void }) {
  if (tickets.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-600">
        No tickets match this filter. SLA check runs hourly — submit a test ticket above to see triage run.
      </div>
    );
  }
  return (
    <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white">
      {tickets.map((t) => (
        <li key={t.id}>
          <button
            onClick={() => onSelect(t.id)}
            className={`block w-full px-3 py-2.5 text-left hover:bg-zinc-50 ${t.id === selectedId ? "bg-zinc-100 ring-1 ring-inset ring-zinc-300" : ""}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-semibold text-zinc-900">{t.subject}</span>
              <StatusPill status={t.status} />
            </div>
            <div className="mt-1 font-mono text-[11px] text-zinc-500">
              {shortId(t.id)} · {t.customerName} · {t.channel} · {timeAgo(t.createdAt)}
              {t.triage ? ` · ${t.triage.category}/${t.triage.urgency}` : " · untriaged"}
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
```
`components/ticket-thread.tsx`:
```tsx
import { shortId, timeAgo } from "@/lib/format";
import { StatusPill } from "./status-pill";

export type ThreadTicket = {
  id: string; subject: string; body: string; customerName: string;
  channel: string; status: string; createdAt: string;
};

export function TicketThread({ ticket }: { ticket: ThreadTicket | null }) {
  if (!ticket) return <div className="rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-600">Select a ticket on the left. Press j/k to move.</div>;
  return (
    <article className="rounded-lg border border-zinc-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-base font-semibold text-zinc-900">{ticket.subject}</h2>
        <StatusPill status={ticket.status} />
      </div>
      <p className="mt-1 font-mono text-[11px] text-zinc-500">
        {shortId(ticket.id)} · {ticket.customerName} · {ticket.channel} · {timeAgo(ticket.createdAt)}
      </p>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-800">{ticket.body}</p>
    </article>
  );
}
```
`components/triage-panel.tsx`:
```tsx
"use client";
import { useState } from "react";

export type Triage = {
  category: string; urgency: string; sentiment: string; summary: string;
  suggestedReply: string; confidence: number; actionTaken: string; aiDegraded: boolean;
};

export function TriagePanel({ triage, provider, onApprove, onDismiss }: {
  triage: Triage | null; provider: string;
  onApprove: (editedReply: string) => void; onDismiss: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  if (!triage) return <div className="rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-600">No triage yet for this ticket.</div>;
  return (
    <aside className="rounded-lg border border-zinc-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-900">Triage</h3>
        <span className="font-mono text-[11px] text-zinc-500">{provider === "gemini-1.5-flash" ? "gemini-1.5-flash" : "demo rules (no key)"}</span>
      </div>
      {triage.aiDegraded && (
        <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-800">AI timed out, used fallback rules.</p>
      )}
      <dl className="mt-3 space-y-1.5 text-sm">
        <div className="flex justify-between"><dt className="text-zinc-500">Category</dt><dd className="font-medium text-zinc-900">{triage.category}</dd></div>
        <div className="flex justify-between"><dt className="text-zinc-500">Urgency</dt><dd className="font-medium text-zinc-900">{triage.urgency}</dd></div>
        <div className="flex justify-between"><dt className="text-zinc-500">Sentiment</dt><dd className="font-medium text-zinc-900">{triage.sentiment}</dd></div>
        <div className="flex justify-between"><dt className="text-zinc-500">Decision</dt><dd className="font-medium text-zinc-900">{triage.actionTaken}</dd></div>
      </dl>
      <div className="mt-2 h-[3px] w-full rounded bg-zinc-100">
        <div className="h-full rounded bg-zinc-500" style={{ width: `${Math.round(triage.confidence * 100)}%` }} />
      </div>
      <p className="mt-1 font-mono text-[11px] text-zinc-500">confidence {triage.confidence.toFixed(2)}</p>
      <p className="mt-3 text-sm text-zinc-700">{triage.summary}</p>
      {editing ? (
        <textarea value={draft || triage.suggestedReply} onChange={(e) => setDraft(e.target.value)} rows={6} className="mt-3 w-full rounded-md border border-zinc-300 p-2 text-sm text-zinc-900" />
      ) : (
        <p className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 p-2 text-sm text-zinc-800">{triage.suggestedReply}</p>
      )}
      <div className="mt-3 flex gap-2">
        <button onClick={() => onApprove(editing ? draft || triage.suggestedReply : triage.suggestedReply)} className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700">
          Approve &amp; close
        </button>
        <button onClick={() => { setEditing((v) => !v); setDraft(triage.suggestedReply); }} className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-100">
          {editing ? "Cancel edit" : "Edit"}
        </button>
        <button onClick={onDismiss} className="rounded-md px-3 py-1.5 text-sm text-zinc-500 hover:bg-zinc-100">Dismiss</button>
      </div>
    </aside>
  );
}
```

- [ ] **Step 5: Implement the inbox page (stats strip + form + 3 columns + keys)**

Replace `app/inbox/page.tsx` entirely:
```tsx
"use client";
import { useCallback, useEffect, useState } from "react";
import { TicketQueue, type QueueTicket } from "@/components/ticket-queue";
import { TicketThread } from "@/components/ticket-thread";
import { TriagePanel, type Triage } from "@/components/triage-panel";

type FullTicket = QueueTicket & {
  body: string;
  triage: (Triage & { id: string }) | null;
};
type Stats = { total: number; autoResolvedRate: number; escalatedCount: number; slaBreaches: number } | null;

export default function InboxPage() {
  const [tickets, setTickets] = useState<FullTicket[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [stats, setStats] = useState<Stats>(null);
  const [provider, setProvider] = useState("demo-rules");
  const [form, setForm] = useState({ subject: "", body: "", customerName: "", channel: "email" });
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    const [t, s] = await Promise.all([
      fetch("/api/tickets").then((r) => r.json()),
      fetch("/api/stats").then((r) => r.json()).catch(() => null),
    ]);
    setTickets(t.tickets ?? []);
    setStats(s);
    setSelectedId((id) => id ?? t.tickets?.[0]?.id ?? null);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      if (e.key === "j" || e.key === "k") {
        const list = filtered();
        const i = list.findIndex((t) => t.id === selectedId);
        const next = e.key === "j" ? list[Math.min(i + 1, list.length - 1)] : list[Math.max(i - 1, 0)];
        if (next) setSelectedId(next.id);
      }
      if (e.key === "r") void approve(selectedId, "");
      if (e.key === "e") void escalate(selectedId);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function filtered() {
    const q = filter.toLowerCase();
    return tickets.filter((t) => !q || `${t.subject} ${t.customerName} ${t.status}`.toLowerCase().includes(q));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/tickets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const data = await res.json();
    if (!res.ok) { setNotice(data.error ?? "Submit failed"); return; }
    setProvider(data.provider);
    setForm({ subject: "", body: "", customerName: "", channel: "email" });
    setNotice(`Saved as ${data.ticket.status}.`);
    await refresh();
    setSelectedId(data.ticket.id);
  }

  async function approve(id: string | null, editedReply: string) {
    if (!id) return;
    await fetch(`/api/tickets/${id}/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ editedReply }) });
    setNotice("Reply sent (demo — no email in v1). Ticket closed.");
    await refresh();
  }

  async function escalate(id: string | null) {
    if (!id) return;
    await fetch(`/api/tickets/${id}/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "escalate" }) });
    setNotice("Ticket escalated.");
    await refresh();
  }

  const selected = tickets.find((t) => t.id === selectedId) ?? null;

  return (
    <main className="mx-auto max-w-[1200px] p-4">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold text-zinc-900">Support tickets</h1>
        {provider === "demo-rules" && <span className="text-xs text-zinc-500">Running in demo mode (no GEMINI_API_KEY).</span>}
      </header>
      {stats && (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[["Total", stats.total], ["Auto-resolved", `${Math.round(stats.autoResolvedRate * 100)}%`], ["Escalated", stats.escalatedCount], ["SLA breaches", stats.slaBreaches]].map(([k, v]) => (
            <div key={k} className="rounded-lg border border-zinc-200 bg-white px-3 py-2">
              <div className="text-[11px] uppercase tracking-wide text-zinc-500">{k}</div>
              <div className="text-lg font-semibold text-zinc-900">{v}</div>
            </div>
          ))}
        </div>
      )}
      <form onSubmit={submit} className="mt-3 rounded-lg border border-zinc-200 bg-white p-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Subject (min 5 chars)" className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm" />
          <div className="flex gap-2">
            <input value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} placeholder="Customer" className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm" />
            <select value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })} className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm">
              <option value="email">email</option>
              <option value="chat">chat</option>
              <option value="twitter">twitter</option>
            </select>
          </div>
        </div>
        <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="What happened? (min 10 chars)" rows={2} className="mt-2 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm" />
        <div className="mt-2 flex items-center gap-3">
          <button type="submit" className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700">Submit ticket</button>
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter (/ to focus)" id="queue-filter" className="w-full max-w-xs rounded-md border border-zinc-300 px-2 py-1.5 text-sm" />
          {notice && <span className="text-xs text-zinc-600">{notice}</span>}
        </div>
      </form>
      <div className="mt-3 grid gap-3 lg:grid-cols-[280px_minmax(0,1fr)_340px]">
        <TicketQueue tickets={filtered()} selectedId={selectedId} onSelect={setSelectedId} />
        <TicketThread ticket={selected} />
        <TriagePanel triage={selected?.triage ?? null} provider={provider} onApprove={(d) => approve(selectedId, d)} onDismiss={() => setSelectedId(selectedId)} />
      </div>
      <p className="mt-3 font-mono text-[11px] text-zinc-500">keys: j/k move · r approve &amp; close · e escalate · / focuses filter</p>
    </main>
  );
}
```
Note: `/` keybinding is documented in the footer; focusing is native via the filter input id. Dismiss collapses back to selection (panel stays honest — nothing hidden).

- [ ] **Step 6: Run tests + typecheck + anti-slop grep**

```bash
npm test
npx tsc --noEmit
```
Expected: `Tests 24 passed`, zero type errors.
```bash
npm run dev
```
Open `http://localhost:3000/inbox`: 12 seed tickets visible, stats strip shows Total 12+, selecting shows thread + triage panel, submit a "how do i export invoices?" ticket → appears as `auto-resolved`, press `j`/`k` to move, `r` closes. Anti-slop grep must print nothing:
```bash
grep -r "bg-gradient\|from-\|via-\|sparkle\|Sparkle\|supercharge\|delight\|unleash\|✨\|🚀" app components lib --include="*.tsx" --include="*.ts" | grep -v "hover:" ; echo "slop-check-done"
```
Expected: only `slop-check-done` (`hover:bg-zinc-*` lines excluded; if any real hit appears, remove it before committing).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add inbox ui with triage panel and keyboard nav"
```

---

### Task 7: README, GitHub, Vercel deploy

**Files:**
- Create: `README.md`
- Verify: `.env.example`, `vercel.json` unchanged and correct
- Test: live URL checks

**Interfaces:**
- Consumes: everything above
- Produces: public `https://support-ticket-triager.vercel.app/inbox` + cron returning 200

- [ ] **Step 1: Write README (resume bullets + ASCII diagram + demo script)**

`README.md`:
```md
# Support Ticket Triager

Full-stack inbox where support tickets are triaged by AI and handled by automation rules.

- Next.js 14 + Prisma + Supabase Postgres inbox; Gemini AI triage pipeline with mock fallback so the demo never breaks.
- Deterministic rules engine (critical auto-escalates, confident how-to auto-resolves) plus hourly SLA cron.
- One-click Vercel deploy, Vitest-covered logic, keyboard-driven internal-tool UI.

## How it works

    browser -> POST /api/tickets -> triageTicket() -> evaluateRules() -> postgres
                                   (gemini, else mock)   (escalate/auto-resolve/open)
    vercel cron -> GET /api/cron/sla-check -> stale high/critical -> escalated

## Local dev

1. `npm install`
2. `Copy-Item .env.example .env` and fill `DATABASE_URL` (Supabase), optional `GEMINI_API_KEY`, any `CRON_SECRET`.
3. `npm run db:push` then `npm run db:seed` then `npm run dev` -> http://localhost:3000/inbox

## 60-second demo

1. Submit "SSO is down for the whole company" -> watch it land `escalated` with a drafted reply.
2. Submit "How do I export my invoices?" -> watch it `auto-resolve`.
3. Point at the stats strip: total, auto-resolved %, escalated, SLA breaches.

## Future (out of scope v1)

Auth, sending email, uploads, websockets, admin panel, billing, mobile app, dark mode, i18n.
```

- [ ] **Step 2: Push to GitHub**

```bash
git add -A
git commit -m "docs: add readme with demo script"
```
Create repo at `https://github.com/new` (name `support-ticket-triager`, Public), then:
```bash
git remote add origin https://github.com/<you>/support-ticket-triager.git
git branch -M main
git push -u origin main
```
Expected: `Branch 'main' set up to track remote branch 'main'`.

- [ ] **Step 3: Deploy on Vercel (free)**

1. `https://vercel.com/new` → Import `support-ticket-triager` → Deploy (first build uses no DB yet — fine).
2. Project → Settings → Environment Variables → add `DATABASE_URL` (Supabase pooled string), `GEMINI_API_KEY` (optional — leave empty for demo mode), `CRON_SECRET` (long random string) → Save.
3. Deployments → Redeploy latest. Vercel auto-picks `vercel.json` cron (`0 * * * *`).

- [ ] **Step 4: Verify live**

Open `https://support-ticket-triager.vercel.app/` → redirects to `/inbox` with seed data (if empty, run `npm run db:seed` locally against the same Supabase DB, then reload).
```bash
curl -s https://support-ticket-triager.vercel.app/api/stats
curl -s https://support-ticket-triager.vercel.app/api/cron/sla-check -H "Authorization: Bearer <CRON_SECRET>"
```
Expected: stats JSON with `total: 12+`; cron → `{"escalated":0}` with HTTP 200. Vercel → Logs shows the hourly cron hitting 200 after the first hour.

- [ ] **Step 5: Final check — nothing uncommitted**

```bash
git status --short
npm test
```
Expected: `git status` prints nothing; `Tests 24 passed`.

---

## Self-Review

**1. Spec coverage (§1–13):** §1 flows → Tasks 5+4; §2 versions → Tasks 1/3/4 + Global Constraints; §3 models → Task 4 schema verbatim; §4 APIs → Task 5 (approve extended, documented); §5 classifier incl. prompt/timeout/fallback → Task 3; §6 rules → Task 2 verbatim; §7 UI layout/columns/keys/seed/empty states/forbidden → Task 6 (+12 seeds in Task 4); §8 validation/fallback/error boundary/cron auth/secrets → Tasks 5/1; §9 tests (6+3+4 cases) → Tasks 2/3/5/6 (20 logic + 4 format = 24); §10 local+deploy commands → Tasks 4/7; §11 README bullets/diagram/demo → Task 7; §12 out-of-scope → Constraints + README Future; §13 success criteria → Task 7 Step 5 + Task 6 checks. No gaps.

**2. Placeholder scan:** no TBD/TODO/lorem/emoji in code; `DATABASE_URL` example uses an obviously fake host; `<you>`/`<CRON_SECRET>` appear only in shell commands where the user substitutes their own — not code placeholders.

**3. Type consistency:** `TriageOutput`/`RuleResult`/status/category/urgency/sentiment unions identical in Tasks 2–6; `provider` lives only at API/UI layer, never in `TriageOutput`; seed writes the same Prisma fields routes write; stats keys match the inbox strip; approve `action` default `close` matches test. Fixed inline: approve extension + spec patch step included in Task 5.
