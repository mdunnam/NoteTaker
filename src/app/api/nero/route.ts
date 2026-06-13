import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/user";
import { neroChat } from "@/lib/nero";

export async function GET() {
  const userId = await getUserId();
  const messages = await prisma.message.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    take: 50,
  });
  return NextResponse.json(messages);
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  const { message } = await req.json();

  if (!message?.trim()) {
    return NextResponse.json({ error: "Empty message" }, { status: 400 });
  }

  // Save user message
  await prisma.message.create({
    data: { userId, role: "USER", content: message },
  });

  // Get recent history for context (last 20 messages)
  const history = await prisma.message.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    take: 20,
  });

  const chatHistory = history.slice(0, -1).map((m) => ({
    role: m.role.toLowerCase() as "user" | "assistant",
    content: m.content,
  }));

  const reply = await neroChat(userId, message, chatHistory);

  // Save Nero's response
  const saved = await prisma.message.create({
    data: { userId, role: "ASSISTANT", content: reply },
  });

  return NextResponse.json({ id: saved.id, content: reply });
}

export async function DELETE() {
  const userId = await getUserId();
  await prisma.message.deleteMany({ where: { userId } });
  return new NextResponse(null, { status: 204 });
}
