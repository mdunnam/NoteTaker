import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const habit = await prisma.habit.update({ where: { id: params.id }, data: body });
  return NextResponse.json(habit);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await prisma.habit.update({ where: { id: params.id }, data: { isActive: false } });
  return new NextResponse(null, { status: 204 });
}
