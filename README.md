# Support Ticket Triager

Full-stack inbox where support tickets are triaged by AI and handled by automation rules.

- Next.js 14 + Prisma + Neon Postgres inbox; Gemini AI triage pipeline with mock fallback so the demo never breaks.
- Deterministic rules engine (critical auto-escalates, confident how-to auto-resolves) plus hourly SLA cron.
- One-click Vercel deploy, Vitest-covered logic, keyboard-driven internal-tool UI.

## How it works

    browser -> POST /api/tickets -> triageTicket() -> evaluateRules() -> postgres
                                   (gemini, else mock)   (escalate/auto-resolve/open)
    vercel cron -> GET /api/cron/sla-check -> stale high/critical -> escalated

AI note: triage calls the Gemini Generative Language REST API directly
(`gemini-1.5-flash`). The Vercel AI SDK was dropped during build because the
`ai@3` / `@ai-sdk/google@1` pair ships split `@ai-sdk/provider` copies and
does not typecheck. Model, prompt, temperature (0.2), token cap (600),
8s timeout, and mock-fallback behavior are unchanged.

## Local dev

1. `npm install`
2. `Copy-Item .env.example .env` and fill `DATABASE_URL` (Neon), optional `GEMINI_API_KEY`, any `CRON_SECRET`.
3. `npm run db:push` then `npm run db:seed` then `npm run dev` -> http://localhost:3000/inbox

## 60-second demo

1. Submit "SSO is down for the whole company" -> watch it land `escalated` with a drafted reply.
2. Submit "How do I export my invoices?" -> watch it `auto-resolve`.
3. Point at the stats strip: total, auto-resolved %, escalated, SLA breaches.

## Future (out of scope v1)

Auth, sending email, uploads, websockets, admin panel, billing, mobile app, dark mode, i18n.
