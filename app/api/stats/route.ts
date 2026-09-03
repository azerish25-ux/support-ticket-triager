import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { slaBreach } from "@/lib/automation/rules";

export async function GET() {
  try {
    const [total, byCat, byUrg, byStatusRows, openUrgent] = await Promise.all([
      prisma.ticket.count(),
      prisma.triage.groupBy({ by: ["category"], _count: true }),
      prisma.triage.groupBy({ by: ["urgency"], _count: true }),
      prisma.ticket.groupBy({ by: ["status"], _count: true }),
      prisma.ticket.findMany({
        where: { status: { in: ["open", "pending"] } },
        select: { createdAt: true, triage: { select: { urgency: true } } },
      }),
    ]);
    const byCategory: Record<string, number> = {};
    for (const r of byCat) byCategory[r.category] = r._count;
    const byUrgency: Record<string, number> = {};
    for (const r of byUrg) byUrgency[r.urgency] = r._count;
    const byStatus: Record<string, number> = {};
    for (const r of byStatusRows) byStatus[r.status] = r._count;
    const auto = byStatus["auto-resolved"] ?? 0;
    const slaBreaches = openUrgent.filter(
      (t) => t.triage && slaBreach(t.createdAt, t.triage.urgency)
    ).length;
    return NextResponse.json({
      total,
      byCategory,
      byUrgency,
      byStatus,
      autoResolvedRate: total === 0 ? 0 : auto / total,
      escalatedCount: byStatus["escalated"] ?? 0,
      slaBreaches,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Could not load stats", retryable: true }, { status: 500 });
  }
}
