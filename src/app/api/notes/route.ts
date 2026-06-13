import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/user";

export async function GET() {
  const userId = await getUserId();
  const notes = await prisma.note.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json(notes);
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  const body = await req.json();
  const note = await prisma.note.create({
    data: {
      userId,
      title: body.title ?? null,
      content: body.content,
      tags: body.tags ?? [],
    },
  });
  return NextResponse.json(note, { status: 201 });
}
