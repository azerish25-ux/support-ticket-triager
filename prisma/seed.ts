import { PrismaClient } from "@prisma/client";
import { mockClassify } from "../lib/ai/classifier";
import { evaluateRules } from "../lib/automation/rules";

const prisma = new PrismaClient();

const TICKETS: Array<{ subject: string; body: string; customerName: string; channel: string }> = [
  {
    subject: "Charged twice for pro plan pls refund ASAP",
    body: "I was charged twice for the pro plan this morning, please refund ASAP!! Invoice #8841.",
    customerName: "Maya R.",
    channel: "email",
  },
  {
    subject: "SSO broken for acme team",
    body: "SSO is down for the acme team, nobody can login since 9am. This is blocking 40 people.",
    customerName: "Dan K.",
    channel: "chat",
  },
  {
    subject: "How do i reset my api key?",
    body: "How do i reset my api key? I lost the old one and the docs page confused me.",
    customerName: "Priya S.",
    channel: "email",
  },
  {
    subject: "Export CSV adds extra quotes",
    body: "Export CSV adds extra quotes around every field since yesterday. Small bug but it breaks our import.",
    customerName: "Tom W.",
    channel: "chat",
  },
  {
    subject: "Please add dark mode",
    body: "Love the product! Would love a dark mode feature for night shifts. Thanks!",
    customerName: "Ana L.",
    channel: "twitter",
  },
  {
    subject: "Can't change my account email",
    body: "I can't change my account email, the form keeps failing with an error. Tried 3 times.",
    customerName: "Jon P.",
    channel: "email",
  },
  {
    subject: "Invoice missing VAT number",
    body: "My invoice is missing our VAT number and finance is angry. Please fix urgently.",
    customerName: "Sofia M.",
    channel: "email",
  },
  {
    subject: "Mobile app crashes on upload",
    body: "Mobile app crashes every time I upload a photo. iPhone 13, latest version. So frustrating.",
    customerName: "Leo B.",
    channel: "chat",
  },
  {
    subject: "Where do I find audit logs?",
    body: "Where do I find audit logs for my workspace? Need them for a compliance review.",
    customerName: "Nina H.",
    channel: "email",
  },
  {
    subject: "Refund still not here after 2 weeks",
    body: "You promised a refund 2 weeks ago and it is still not here. This is terrible, refund now!!",
    customerName: "Omar F.",
    channel: "twitter",
  },
  {
    subject: "Slack integration wish",
    body: "It would be great if you added a Slack integration that posts escalations. Happy to beta test.",
    customerName: "Kate D.",
    channel: "chat",
  },
  {
    subject: "Password reset email never arrives",
    body: "Password reset email never arrives, checked spam twice. Still locked out, annoying.",
    customerName: "Rob C.",
    channel: "email",
  },
];

async function main() {
  await prisma.triage.deleteMany();
  await prisma.ticket.deleteMany();
  for (const t of TICKETS) {
    const triage = mockClassify({ subject: t.subject, body: t.body, channel: t.channel });
    const rule = evaluateRules(triage);
    const ticket = await prisma.ticket.create({ data: { ...t, status: rule.newStatus } });
    await prisma.triage.create({
      data: {
        ticketId: ticket.id,
        category: triage.category,
        urgency: triage.urgency,
        sentiment: triage.sentiment,
        summary: triage.summary,
        suggestedReply: triage.suggestedReply,
        confidence: triage.confidence,
        actionTaken: rule.actionTaken,
        aiDegraded: false,
      },
    });
  }
  console.log(`Seeded ${TICKETS.length} tickets.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
