import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/user";

export async function GET(req: NextRequest) {
  const userId = await getUserId();
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const projectId = searchParams.get("projectId");

  const where: Record<string, unknown> = { userId };
  if (status) where.status = status;
  if (projectId) where.projectId = projectId;

  const tasks = await prisma.task.findMany({
    where,
    orderBy: [{ dueDate: "asc" }, { priority: "desc" }, { createdAt: "desc" }],
  });
  return NextResponse.json(tasks);
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  const body = await req.json();

  const task = await prisma.task.create({
    data: {
      userId,
      title: body.title,
      notes: body.notes ?? null,
      priority: body.priority ?? "MEDIUM",
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      recurrence: body.recurrence ?? null,
      projectId: body.projectId ?? null,
    },
  });
  return NextResponse.json(task, { status: 201 });
}
