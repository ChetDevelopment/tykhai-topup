import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const ticketSchema = z.object({
  subject: z.string().min(5).max(100),
  category: z.enum(["ORDER_ISSUE", "REFUND", "GENERAL", "BUG"]),
  orderId: z.string().optional(),
  message: z.string().min(10).max(2000),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional().default("NORMAL"),
});

export async function GET() {
  const session = await getCurrentUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tickets = await prisma.ticket.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: "desc" },
    include: { order: { select: { orderNumber: true, product: { select: { name: true } } } } }
  });

  return NextResponse.json(tickets);
}

export async function POST(req: NextRequest) {
  const session = await getCurrentUser();
  if (!session) {
    return NextResponse.json({ error: "Please login to submit a ticket" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = ticketSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }

  const ticket = await prisma.ticket.create({
    data: {
      userId: session.userId,
      subject: parsed.data.subject,
      category: parsed.data.category,
      message: parsed.data.message,
      priority: parsed.data.priority,
      orderId: parsed.data.orderId,
    }
  });

  return NextResponse.json({ success: true, ticketId: ticket.id });
}