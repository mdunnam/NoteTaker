import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getThinkingMemory } from "@/lib/userMemory";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

async function enqueueEnrichment(noteId: string, userId: string, origin: string) {
  await prisma.noteJob.create({ data: { noteId, userId } });
  const workerSecret = process.env.WORKER_SECRET;
  if (workerSecret) {
    void fetch(`${origin}/api/worker/enrich`, {
      method: "POST",
      headers: { Authorization: `Bearer ${workerSecret}` },
    }).catch(() => {});
  }
}

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

  // Persist aliases
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

  // Auto-resolve: find notes that mention any of the user's aliases and re-enrich them.
  // This fixes misclassifications like "Michael Dunnam is a hiring candidate" when Michael IS the user.
  let requeuedCount = 0;
  if (aliases.length > 0) {
    const notes = await prisma.note.findMany({
      where: {
        userId: session.user.id,
        isArchived: false,
        status: "PROCESSED",
        OR: aliases.map((alias) => ({
          rawContent: { contains: alias, mode: Prisma.QueryMode.insensitive },
        })),
      },
      select: { id: true },
      take: 50,
    });

    for (const note of notes) {
      // Mark as needs re-processing
      await prisma.note.update({
        where: { id: note.id },
        data: { status: "UNPROCESSED" },
      });
      await enqueueEnrichment(note.id, session.user.id, req.nextUrl.origin);
      requeuedCount++;
    }
  }

  return NextResponse.json({ identityAliases: aliases, requeuedNotes: requeuedCount });
}
