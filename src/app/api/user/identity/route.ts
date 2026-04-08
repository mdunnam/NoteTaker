/**
 * GET  /api/user/identity  — get current identity aliases
 * POST /api/user/identity  — set identity aliases (replaces existing)
 */

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getThinkingMemory } from "@/lib/userMemory";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const memory = await getThinkingMemory(session.user.id);
  return NextResponse.json({ identityAliases: memory.identityAliases });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const aliases: string[] = Array.isArray(body.identityAliases)
    ? body.identityAliases
        .filter((v: unknown): v is string => typeof v === "string" && v.trim().length > 0)
        .map((v: string) => v.trim())
        .slice(0, 10)
    : [];

  const prefs = await prisma.userPreferences.findUnique({
    where: { userId: session.user.id },
    select: { thinkingMemory: true },
  });

  const existing = (prefs?.thinkingMemory && typeof prefs.thinkingMemory === "object" && !Array.isArray(prefs.thinkingMemory))
    ? prefs.thinkingMemory as Record<string, unknown>
    : {};

  const updated = { ...existing, identityAliases: aliases };

  await prisma.userPreferences.upsert({
    where: { userId: session.user.id },
    update: { thinkingMemory: updated as Prisma.InputJsonValue },
    create: { userId: session.user.id, thinkingMemory: updated as Prisma.InputJsonValue },
  });

  return NextResponse.json({ identityAliases: aliases });
}
