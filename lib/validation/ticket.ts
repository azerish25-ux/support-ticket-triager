import { z } from "zod";

export const createTicketSchema = z.object({
  subject: z.string().min(5).max(160),
  body: z.string().min(10).max(4000),
  customerName: z.string().min(2).max(80),
  channel: z.enum(["email", "chat", "twitter"]),
});

export type CreateTicketInput = z.infer<typeof createTicketSchema>;

export const approveSchema = z.object({
  editedReply: z.string().max(2000).optional(),
  action: z.enum(["close", "escalate"]).default("close"),
});
