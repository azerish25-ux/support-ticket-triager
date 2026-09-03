import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { triageTicket } from "@/lib/ai/classifier";
import { evaluateRules } from "@/lib/automation/rules";
import { createTicketSchema } from "@/lib/validation/ticket";

export async function POST(req: Request) {
  const parsed = createTicketSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid ticket", fields: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  try {
    const ticket = await prisma.ticket.create({ data: { ...parsed.data, status: "pending" } });
    const triage = await triageTicket({
      subject: ticket.subject,
      body: ticket.body,
      channel: ticket.channel,
    });
    const rule = evaluateRules(triage);
    const updated = await prisma.ticket.update({
      where: { id: ticket.id },
      data: { status: rule.newStatus },
    });
    const row = await prisma.triage.create({
      data: {
        ticketId: ticket.id,
        category: triage.category,
        urgency: triage.urgency,
        sentiment: triage.sentiment,
        summary: triage.summary,
        suggestedReply: triage.suggestedReply,
        confidence: triage.confidence,
        actionTaken: rule.actionTaken,
        aiDegraded: triage.aiDegraded,
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
