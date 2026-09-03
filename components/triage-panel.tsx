"use client";
import { useState } from "react";

export type Triage = {
  category: string;
  urgency: string;
  sentiment: string;
  summary: string;
  suggestedReply: string;
  confidence: number;
  actionTaken: string;
  aiDegraded: boolean;
};

export function TriagePanel({
  triage,
  provider,
  onApprove,
  onDismiss,
}: {
  triage: Triage | null;
  provider: string;
  onApprove: (editedReply: string) => void;
  onDismiss: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  if (!triage)
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-600">
        No triage yet for this ticket.
      </div>
    );
  return (
    <aside className="rounded-lg border border-zinc-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-900">Triage</h3>
        <span className="font-mono text-[11px] text-zinc-500">
          {provider === "gemini-1.5-flash" ? "gemini-1.5-flash" : "demo rules (no key)"}
        </span>
      </div>
      {triage.aiDegraded && (
        <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-800">
          AI timed out, used fallback rules.
        </p>
      )}
      <dl className="mt-3 space-y-1.5 text-sm">
        <div className="flex justify-between">
          <dt className="text-zinc-500">Category</dt>
          <dd className="font-medium text-zinc-900">{triage.category}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-zinc-500">Urgency</dt>
          <dd className="font-medium text-zinc-900">{triage.urgency}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-zinc-500">Sentiment</dt>
          <dd className="font-medium text-zinc-900">{triage.sentiment}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-zinc-500">Decision</dt>
          <dd className="font-medium text-zinc-900">{triage.actionTaken}</dd>
        </div>
      </dl>
      <div className="mt-2 h-[3px] w-full rounded bg-zinc-100">
        <div
          className="h-full rounded bg-zinc-500"
          style={{ width: `${Math.round(triage.confidence * 100)}%` }}
        />
      </div>
      <p className="mt-1 font-mono text-[11px] text-zinc-500">
        confidence {triage.confidence.toFixed(2)}
      </p>
      <p className="mt-3 text-sm text-zinc-700">{triage.summary}</p>
      {editing ? (
        <textarea
          value={draft || triage.suggestedReply}
          onChange={(e) => setDraft(e.target.value)}
          rows={6}
          className="mt-3 w-full rounded-md border border-zinc-300 p-2 text-sm text-zinc-900"
        />
      ) : (
        <p className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 p-2 text-sm text-zinc-800">
          {triage.suggestedReply}
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <button
          onClick={() => onApprove(editing ? draft || triage.suggestedReply : triage.suggestedReply)}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700"
        >
          Approve &amp; close
        </button>
        <button
          onClick={() => {
            setEditing((v) => !v);
            setDraft(triage.suggestedReply);
          }}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-100"
        >
          {editing ? "Cancel edit" : "Edit"}
        </button>
        <button
          onClick={onDismiss}
          className="rounded-md px-3 py-1.5 text-sm text-zinc-500 hover:bg-zinc-100"
        >
          Dismiss
        </button>
      </div>
    </aside>
  );
}
