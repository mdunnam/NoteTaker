import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/user";

export async function GET() {
  const userId = await getUserId();
  const today = new Date().toISOString().split("T")[0];
  const habits = await prisma.habit.findMany({ where: { userId, isActive: true } });
  const logs = await prisma.habitLog.findMany({
    where: { habitId: { in: habits.map((h) => h.id) }, date: today },
  });
  const logMap = new Map(logs.map((l) => [l.habitId, l.completed]));
  return NextResponse.json(habits.map((h) => ({ ...h, completedToday: !!logMap.get(h.id) })));
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  const body = await req.json();
  const habit = await prisma.habit.create({
    data: {
      userId,
      name: body.name,
      description: body.description ?? null,
      icon: body.icon ?? null,
      color: body.color ?? "#6366f1",
      frequency: body.frequency ?? "daily",
    },
  });
  return NextResponse.json(habit, { status: 201 });
}
