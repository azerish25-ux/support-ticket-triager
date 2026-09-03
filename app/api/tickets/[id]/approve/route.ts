import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { approveSchema } from "@/lib/validation/ticket";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const parsed = approveSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid action", retryable: false }, { status: 400 });
  try {
    const ticket = await prisma.ticket.update({
      where: { id: params.id },
      data: { status: parsed.data.action === "escalate" ? "escalated" : "closed" },
    });
    return NextResponse.json({ ticket });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Ticket not found", retryable: false }, { status: 404 });
  }
}
