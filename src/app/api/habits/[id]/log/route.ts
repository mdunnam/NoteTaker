import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const today = new Date().toISOString().split("T")[0];
  const log = await prisma.habitLog.upsert({
    where: { habitId_date: { habitId: params.id, date: today } },
    create: { habitId: params.id, date: today, completed: body.completed ?? true, note: body.note },
    update: { completed: body.completed ?? true, note: body.note },
  });
  return NextResponse.json(log);
}
