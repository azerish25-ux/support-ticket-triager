import { shortId, timeAgo } from "@/lib/format";
import { StatusPill } from "./status-pill";

export type ThreadTicket = {
  id: string;
  subject: string;
  body: string;
  customerName: string;
  channel: string;
  status: string;
  createdAt: string;
};

export function TicketThread({ ticket }: { ticket: ThreadTicket | null }) {
  if (!ticket)
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-600">
        Select a ticket on the left. Press j/k to move.
      </div>
    );
  return (
    <article className="rounded-lg border border-zinc-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-base font-semibold text-zinc-900">{ticket.subject}</h2>
        <StatusPill status={ticket.status} />
      </div>
      <p className="mt-1 font-mono text-[11px] text-zinc-500">
        {shortId(ticket.id)} · {ticket.customerName} · {ticket.channel} ·{" "}
        {timeAgo(ticket.createdAt)}
      </p>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-800">{ticket.body}</p>
    </article>
  );
}
