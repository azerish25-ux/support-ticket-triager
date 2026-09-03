"use client";
import { useCallback, useEffect, useState } from "react";
import { TicketQueue, type QueueTicket } from "@/components/ticket-queue";
import { TicketThread } from "@/components/ticket-thread";
import { TriagePanel, type Triage } from "@/components/triage-panel";

type FullTicket = QueueTicket & {
  body: string;
  triage: (Triage & { id: string }) | null;
};
type Stats = {
  total: number;
  autoResolvedRate: number;
  escalatedCount: number;
  slaBreaches: number;
} | null;

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
      fetch("/api/tickets")
        .then((r) => r.json())
        .catch(() => ({ tickets: [] })),
      fetch("/api/stats")
        .then((r) => r.json())
        .catch(() => null),
    ]);
    setTickets(t.tickets ?? []);
    setStats(s);
    setSelectedId((id) => id ?? t.tickets?.[0]?.id ?? null);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "/") {
        e.preventDefault();
        document.getElementById("queue-filter")?.focus();
        return;
      }
      const list = tickets.filter((t) => matches(t, filter));
      if (e.key === "j" || e.key === "k") {
        const i = list.findIndex((t) => t.id === selectedId);
        const next =
          e.key === "j" ? list[Math.min(i + 1, list.length - 1)] : list[Math.max(i - 1, 0)];
        if (next) setSelectedId(next.id);
      }
      if (e.key === "r") void approve(selectedId, "");
      if (e.key === "e") void escalate(selectedId);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function matches(t: FullTicket, q: string) {
    const needle = q.toLowerCase();
    return !needle || `${t.subject} ${t.customerName} ${t.status}`.toLowerCase().includes(needle);
  }

  function filtered() {
    return tickets.filter((t) => matches(t, filter));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) {
      setNotice(data.error ?? "Submit failed");
      return;
    }
    setProvider(data.provider);
    setForm({ subject: "", body: "", customerName: "", channel: "email" });
    setNotice(`Saved as ${data.ticket.status}.`);
    await refresh();
    setSelectedId(data.ticket.id);
  }

  async function approve(id: string | null, editedReply: string) {
    if (!id) return;
    await fetch(`/api/tickets/${id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ editedReply }),
    });
    setNotice("Reply sent (demo — no email in v1). Ticket closed.");
    await refresh();
  }

  async function escalate(id: string | null) {
    if (!id) return;
    await fetch(`/api/tickets/${id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "escalate" }),
    });
    setNotice("Ticket escalated.");
    await refresh();
  }

  const selected = tickets.find((t) => t.id === selectedId) ?? null;

  return (
    <main className="mx-auto max-w-[1200px] p-4">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold text-zinc-900">Support tickets</h1>
        {provider === "demo-rules" && (
          <span className="text-xs text-zinc-500">Running in demo mode (no GEMINI_API_KEY).</span>
        )}
      </header>
      {stats && (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(
            [
              ["Total", stats.total],
              ["Auto-resolved", `${Math.round(stats.autoResolvedRate * 100)}%`],
              ["Escalated", stats.escalatedCount],
              ["SLA breaches", stats.slaBreaches],
            ] as Array<[string, string | number]>
          ).map(([k, v]) => (
            <div key={k} className="rounded-lg border border-zinc-200 bg-white px-3 py-2">
              <div className="text-[11px] uppercase tracking-wide text-zinc-500">{k}</div>
              <div className="text-lg font-semibold text-zinc-900">{v}</div>
            </div>
          ))}
        </div>
      )}
      <form onSubmit={submit} className="mt-3 rounded-lg border border-zinc-200 bg-white p-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            value={form.subject}
            onChange={(e) => setForm({ ...form, subject: e.target.value })}
            placeholder="Subject (min 5 chars)"
            className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
          />
          <div className="flex gap-2">
            <input
              value={form.customerName}
              onChange={(e) => setForm({ ...form, customerName: e.target.value })}
              placeholder="Customer"
              className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
            />
            <select
              value={form.channel}
              onChange={(e) => setForm({ ...form, channel: e.target.value })}
              className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
            >
              <option value="email">email</option>
              <option value="chat">chat</option>
              <option value="twitter">twitter</option>
            </select>
          </div>
        </div>
        <textarea
          value={form.body}
          onChange={(e) => setForm({ ...form, body: e.target.value })}
          placeholder="What happened? (min 10 chars)"
          rows={2}
          className="mt-2 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
        />
        <div className="mt-2 flex items-center gap-3">
          <button
            type="submit"
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700"
          >
            Submit ticket
          </button>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter (/ to focus)"
            id="queue-filter"
            className="w-full max-w-xs rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
          />
          {notice && <span className="text-xs text-zinc-600">{notice}</span>}
        </div>
      </form>
      <div className="mt-3 grid gap-3 lg:grid-cols-[280px_minmax(0,1fr)_340px]">
        <TicketQueue tickets={filtered()} selectedId={selectedId} onSelect={setSelectedId} />
        <TicketThread ticket={selected} />
        <TriagePanel
          triage={selected?.triage ?? null}
          provider={provider}
          onApprove={(d) => approve(selectedId, d)}
          onDismiss={() => setSelectedId(selectedId)}
        />
      </div>
      <p className="mt-3 font-mono text-[11px] text-zinc-500">
        keys: j/k move · r approve &amp; close · e escalate · / focuses filter
      </p>
    </main>
  );
}
