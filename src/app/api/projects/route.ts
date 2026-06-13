import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/user";

export async function GET() {
  const userId = await getUserId();
  const projects = await prisma.project.findMany({
    where: { userId },
    include: { _count: { select: { tasks: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(projects);
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  const body = await req.json();
  const project = await prisma.project.create({
    data: {
      userId,
      name: body.name,
      description: body.description ?? null,
      color: body.color ?? "#7c3aed",
      icon: body.icon ?? null,
    },
  });
  return NextResponse.json(project, { status: 201 });
}
