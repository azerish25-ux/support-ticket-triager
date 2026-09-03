# Support Ticket Triager — Design Spec

**Date:** 2026-09-02
**Status:** Approved by user (all 3 sections)
**Goal:** Build a live, resume-worthy full-stack web app where support tickets are auto-triaged by AI (category, urgency, sentiment, summary, reply draft) and automation rules + cron handle escalation and auto-resolution.

**User context:** Confident builder, targeting full-stack roles, wants VS Code project, real AI via free Gemini/Groq key with mock fallback, deploy to free Vercel domain, UI must look human — zero AI-slop.

---

## 1. Architecture

Single Next.js 14 repo (App Router, TypeScript). Frontend + API routes deploy together to Vercel free as `support-ticket-triager.vercel.app`. Postgres via Neon free + Prisma ORM. AI via Vercel AI SDK calling Google Gemini 1.5 Flash (free tier), model string configurable via env to also support Groq. Mock classifier used when no key is set or on timeout, flagged in UI as demo mode. Vercel Cron calls SLA-check hourly.

Request flow (MVP, synchronous for simplicity):
Browser form → POST /api/tickets → Zod validate → Prisma create Ticket(status=pending) → triageTicket() → Prisma create Triage → evaluateRules() → Prisma update Ticket status → return Ticket+Triage JSON → UI renders instantly.

Cron flow:
Vercel Cron GET /api/cron/sla-check (header Authorization: Bearer CRON_SECRET) → find open high/critical older than 4h → set escalated → return count. No email in v1; digest rendered on dashboard.

## 2. Tech Stack (pinned)

- Node 20 LTS, Next.js 14.2.x (App Router), React 18, TypeScript 5.4 strict
- Tailwind CSS 3.4, shadcn/ui (only Button, Badge, Input, Textarea, Dialog — no more)
- Prisma 5.x + Neon Postgres free (DATABASE_URL), Prisma seed script
- Vercel AI SDK 3.x + @ai-sdk/google, model `google:gemini-1.5-flash`, timeout 8000ms
- Zod 3.x for API validation
- Vitest 1.x for unit tests, Playwright only as single smoke spec (optional if time)
- Vercel hosting + Vercel Cron (free hobby), GitHub repo

Why: one repo, one deploy, standard resume keywords, all free, works in VS Code on Windows with `npm run dev`.

## 3. Data Models (Prisma)

```prisma
model Ticket {
  id           String   @id @default(cuid())
  subject      String   @db.VarChar(160)
  body         String   @db.Text
  customerName String   @db.VarChar(80)
  channel      String   @db.VarChar(20) // email | chat | twitter
  status       String   @db.VarChar(20) @default("pending") // pending | open | escalated | auto-resolved | closed
  createdAt    DateTime @default(now())
  triage       Triage?
}

model Triage {
  id             String   @id @default(cuid())
  ticketId       String   @unique
  ticket         Ticket   @relation(fields: [ticketId], references: [id], onDelete: Cascade)
  category       String   // billing | bug | feature | account | how-to
  urgency        String   // low | medium | high | critical
  sentiment      String   // angry | frustrated | neutral | happy
  summary        String   @db.VarChar(280)
  suggestedReply String   @db.Text
  confidence     Float
  actionTaken    String   // escalated | auto-resolved | needs-review
  aiDegraded     Boolean  @default(false)
  createdAt      DateTime @default(now())
}
```

Stats endpoint aggregates by category/urgency/status in SQL via Prisma groupBy.

## 4. API Contracts

POST /api/tickets — body `{ subject: string(5..160), body: string(10..4000), customerName: string(2..80), channel: "email"|"chat"|"twitter" }` → 201 `{ ticket, triage }`.

GET /api/tickets?status=open&category=bug → 200 `{ tickets: (Ticket & { triage: Triage|null })[] }`, newest first, limit 50.

POST /api/tickets/[id]/approve — body `{ editedReply?: string; action?: "close"|"escalate" }` (default `close`; `escalate` exists for the E keybinding) → sets status closed or escalated, returns ticket. Used for human-approve demo.

GET /api/stats → `{ total, byCategory: Record<string,number>, byUrgency, autoResolvedRate, escalatedCount, slaBreaches }`.

GET /api/cron/sla-check — requires cron secret header, returns `{ escalated: number }`.

All APIs: Zod validation, 400 on bad input with field errors, 500 with `{ error: "message", retryable: true }`.

## 5. AI Classifier — `lib/ai/classifier.ts`

```ts
export type TriageInput = { subject: string; body: string; channel: string };
export type TriageOutput = {
  category: "billing"|"bug"|"feature"|"account"|"how-to";
  urgency: "low"|"medium"|"high"|"critical";
  sentiment: "angry"|"frustrated"|"neutral"|"happy";
  summary: string; // <=140 chars
  suggestedReply: string; // <=600 chars, plain tone, no emoji
  confidence: number; // 0..1
  aiDegraded: boolean;
};
export async function triageTicket(input: TriageInput): Promise<TriageOutput>
```

Behavior: if `process.env.GEMINI_API_KEY` missing → mockClassify() immediately. Else call Gemini with JSON-mode system prompt (temperature 0.2, maxTokens 600) with 8000ms AbortController timeout. On any throw/timeout/bad JSON → mockClassify() with aiDegraded=true.

mockClassify rules (deterministic, for tests + demo): contains "refund|charged twice|billing|invoice" → billing/high; "sso|login|500|crash|broken|bug" → bug (critical if "acme|sso|outage|down"); "how do i|how to|reset|where" → how-to/low; "feature|add|wish" → feature/low; sentiment angry if "asap|angry|furious|!!|refund now"; summary = first 120 chars of body; suggestedReply = canned template per category.

System prompt (exact, stored in file): "You are a support triage assistant. Return ONLY valid JSON with keys category, urgency, sentiment, summary (<=140 chars), suggestedReply (<=600 chars, plain helpful tone, no emoji, no 'As an AI'), confidence (0..1). Categories: billing, bug, feature, account, how-to. Urgency: low, medium, high, critical (critical only for outage, security, or enterprise down)."

## 6. Automation Rules — `lib/automation/rules.ts`

```ts
export type RuleResult = { newStatus: "escalated"|"auto-resolved"|"open"; actionTaken: string };
export function evaluateRules(t: TriageOutput): RuleResult {
  if (t.urgency === "critical") return { newStatus: "escalated", actionTaken: "escalated" };
  if (t.category === "how-to" && t.confidence >= 0.8) return { newStatus: "auto-resolved", actionTaken: "auto-resolved" };
  if (t.category === "billing" && t.urgency === "high" && t.sentiment === "angry") return { newStatus: "escalated", actionTaken: "escalated" };
  return { newStatus: "open", actionTaken: "needs-review" };
}
export function slaBreach(createdAt: Date, urgency: string, now?: Date): boolean {
  if (urgency !== "high" && urgency !== "critical") return false;
  const ms = (now ?? new Date()).getTime() - createdAt.getTime();
  return ms > 4 * 3600 * 1000;
}
```

No other rules in v1 (YAGNI). All rule decisions displayed in UI with reason line.

## 7. UI/UX — Human, Anti-Slop (hard requirement)

Layout is an internal tool, NOT a marketing landing page. No landing hero at all — `/` redirects to `/inbox`.

`/inbox` three-column (1200px max, left 280px queue, center flexible thread, right 340px AI panel). Mobile stacks vertically.

Visual system: Tailwind neutral grays (zinc), white cards with `border-zinc-200`, radius 8px, no gradients, no glow, no glassmorphism. Fonts: system sans for body, `Geist Mono` or `ui-monospace` for IDs/timestamps, one condensed grotesk (e.g., Inter Tight 600) for ticket subjects only. Accent colors: amber-600 escalated, green-700 auto-resolved, zinc-500 open. Status as small uppercase pills with dot.

Interactions: j/k navigate queue, e escalate, r approve reply, / focuses search. Real timestamps ("2h ago, #a3f9"). AI panel header: "Triage — gemini-1.5-flash, confidence 0.86" or "Triage — demo rules (no key)". Buttons: Approve & close / Edit / Dismiss. Confidence bar is thin 3px, not a rainbow gauge.

Seed data (12 real messy tickets, in `prisma/seed.ts`): e.g. "charged twice for pro plan pls refund ASAP" (billing/high/angry), "SSO broken for acme team, nobody can login" (bug/critical), "how do i reset api key?" (how-to/low), "export csv adds extra quotes" (bug/medium), etc. Full list in seed file — no lorem ipsum anywhere.

Empty states: "No escalated tickets. SLA check runs hourly." with button "Submit test ticket".

Forbidden: sparkles/emoji icons (use lucide), gradient text, "supercharge/delight/unleash", centered hero, 3 generic feature cards, testimonial section, dark-mode neon glow.

## 8. Error Handling

- Validation: Zod, inline field errors, preserve input.
- AI fail → mock + `aiDegraded` badge "AI timed out, used fallback rules".
- DB fail → `app/error.tsx` boundary with Retry button, log to console in v1.
- Cron auth: compare `Authorization: Bearer ${CRON_SECRET}`, 401 otherwise.
- No secrets in client. `GEMINI_API_KEY`, `DATABASE_URL`, `CRON_SECRET` server-only.

## 9. Testing

Vitest unit (must pass in CI):
- `rules.evaluate` — 6 cases (critical→escalated, how-to high-conf→auto-resolved, how-to low-conf→open, billing angry high→escalated, bug medium→open, feature low→open)
- `slaBreach` — 3 cases (high 5h→true, high 1h→false, low 10h→false)
- `mockClassify` — 4 cases (refund→billing, sso acme→bug/critical, how do i→how-to, empty-ish→neutral)

Smoke (manual checklist + one Playwright spec if time): submit ticket → appears in queue with triage panel → approve → status closed → stats update.

## 10. Deploy + Local Dev (VS Code, Windows)

Local: `npm install`, copy `.env.example` → `.env` (DATABASE_URL, GEMINI_API_KEY optional, CRON_SECRET=dev-secret), `npx prisma db push`, `npm run db:seed`, `npm run dev` → http://localhost:3000/inbox.

Deploy: push to GitHub → Import in Vercel → add same 3 env vars → Deploy → enable Cron in `vercel.json` (`{ "crons": [{ "path": "/api/cron/sla-check", "schedule": "0 * * * *" }] }`) → live at `https://support-ticket-triager.vercel.app/inbox`.

`.env.example` contains placeholder values only, never real keys.

## 11. Resume Story

README includes: 3 bullet lines ("Next.js 14 + Prisma + Neon full-stack inbox; Gemini AI triage pipeline with fallback; rules engine + hourly SLA cron, 1-click Vercel deploy"), architecture diagram (ASCII), 60-sec demo script (submit SSO outage → escalated; submit how-to → auto-resolved; show stats).

## 12. Out of Scope (v1 YAGNI)

No auth/multi-user, no email sending, no file uploads, no realtime websockets, no admin panel, no billing, no mobile app, no dark mode toggle, no i18n. Noted as "Future" in README only.

## 13. Success Criteria

- `npm run dev` works from fresh clone with only `.env` copy + 2 commands
- Submit → triage visible <6s (real AI) or <500ms (mock)
- Works with no GEMINI_API_KEY (demo banner, all tests pass)
- Deployed Vercel URL shareable, cron returns 200
- UI passes anti-slop check: no gradients, no emoji icons, real data, keyboard nav works

---

**Self-review:** No TBD/TODO placeholders. Types consistent (TriageOutput ↔ evaluateRules ↔ Prisma). Rules referenced in API + tests match. Scope is single subsystem (one deploy). Seed + prompt + env all concrete. UI constraints explicit and testable.
