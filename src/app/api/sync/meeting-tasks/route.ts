import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/user";

interface SyncItem {
  sourceId: string;       // stable id, e.g. "granola:<meetingId>:<slug>"
  title: string;
  notes?: string;
  priority?: "LOW" | "MEDIUM" | "HIGH";
  dueDate?: string;
}

// Upsert tasks from external sources (Granola, Calendar). Dedupes on sourceId —
// safe to re-run daily without creating duplicates.
export async function POST(req: NextRequest) {
  const userId = await getUserId();
  const body = await req.json();
  const items: SyncItem[] = body.items ?? [];
  const source: string = body.source ?? "granola";

  let created = 0;
  let skipped = 0;

  for (const item of items) {
    if (!item.sourceId || !item.title) continue;
    const existing = await prisma.task.findUnique({ where: { sourceId: item.sourceId } });
    if (existing) {
      skipped++;
      continue;
    }
    await prisma.task.create({
      data: {
        userId,
        title: item.title,
        notes: item.notes ?? null,
        priority: item.priority ?? "MEDIUM",
        dueDate: item.dueDate ? new Date(item.dueDate) : null,
        source,
        sourceId: item.sourceId,
      },
    });
    created++;
  }

  return NextResponse.json({ created, skipped, total: items.length });
}