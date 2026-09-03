import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { slaBreach } from "@/lib/automation/rules";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const now = new Date();
  const candidates = await prisma.ticket.findMany({
    where: { status: { in: ["open", "pending"] } },
    select: { id: true, createdAt: true, triage: { select: { urgency: true } } },
  });
  const stale = candidates.filter((t) => t.triage && slaBreach(t.createdAt, t.triage.urgency, now));
  if (stale.length > 0) {
    await prisma.ticket.updateMany({
      where: { id: { in: stale.map((t) => t.id) } },
      data: { status: "escalated" },
    });
  }
  return NextResponse.json({ escalated: stale.length });
}
