const STYLES: Record<string, string> = {
  pending: "bg-zinc-100 text-zinc-600",
  open: "bg-zinc-200 text-zinc-700",
  escalated: "bg-amber-100 text-amber-800",
  "auto-resolved": "bg-green-100 text-green-800",
  closed: "bg-zinc-100 text-zinc-400",
};

export function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${STYLES[status] ?? STYLES.open}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}
