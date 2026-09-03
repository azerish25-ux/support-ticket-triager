"use client";
import { shortId, timeAgo } from "@/lib/format";
import { StatusPill } from "./status-pill";

export type QueueTicket = {
  id: string;
  subject: string;
  customerName: string;
  channel: string;
  status: string;
  createdAt: string;
  triage: { urgency: string; category: string } | null;
};

export function TicketQueue({
  tickets,
  selectedId,
  onSelect,
}: {
  tickets: QueueTicket[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (tickets.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-600">
        No tickets match this filter. SLA check runs hourly — submit a test ticket above to see
        triage run.
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
