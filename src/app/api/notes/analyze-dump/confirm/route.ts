import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { checkRateLimit } from "@/lib/rateLimit";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const ConfirmSplitSchema = z.object({
  rawContent: z.string().min(1).max(10000),
  title: z.string().min(1).max(200),
  summary: z.string().max(500).optional().nullable(),
  category: z.string().max(120).optional().nullable(),
  type: z.enum(["TASK", "IDEA", "NOTE", "REFERENCE", "DECISION"]),
  priority: z.enum(["high", "medium", "low"]).default("medium"),
  tags: z.array(z.string()).max(20).default([]),
  suggestedProject: z.string().max(160).optional().nullable(),
  extractedTasks: z
    .array(
      z.object({
        text: z.string().min(1).max(300),
        dueDate: z.string().optional().nullable(),
        priority: z.enum(["high", "medium", "low"]).optional(),
      })
    )
    .default([]),
});

const ConfirmDumpSchema = z.object({
  splits: z.array(ConfirmSplitSchema).min(1).max(8),
  collectionId: z.string().optional().nullable(),
  sourceLabel: z.string().max(120).optional(),
});

/**
 * POST /api/notes/analyze-dump/confirm
 * Create selected organized split notes from analyze-dump preview.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    const rateLimitResult = checkRateLimit(session.user.id, "/api/notes/analyze-dump/confirm");
    if (!rateLimitResult.ok) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again in a moment." },
        { status: 429, headers: { "Retry-After": String(rateLimitResult.retryAfter) } }
      );
    }

    const parsed = ConfirmDumpSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { splits, collectionId, sourceLabel } = parsed.data;

    const created = await prisma.$transaction(async (tx) => {
      const createdNotes: Array<{ id: string }> = [];

      for (const split of splits) {
        const note = await tx.note.create({
          data: {
            userId,
            rawContent: split.rawContent.trim(),
            title: split.title.trim(),
            summary: split.summary || null,
            category: split.category?.trim() || null,
            type: split.type,
            priority: split.priority,
            tags: split.tags,
            suggestedProject: split.suggestedProject?.trim() || null,
            extractedTasks: split.extractedTasks || null,
            aiMeta: {
              source: "analyze-dump",
              sourceLabel: sourceLabel || null,
            },
            collectionId: collectionId || null,
            status: "PROCESSING",
          },
          select: { id: true },
        });

        await tx.noteJob.create({
          data: {
            noteId: note.id,
            userId,
          },
        });

        createdNotes.push(note);
      }

      return createdNotes;
    });

    const workerSecret = process.env.WORKER_SECRET;
    if (workerSecret) {
      const baseUrl = request.nextUrl.origin;
      void fetch(`${baseUrl}/api/worker/enrich`, {
        method: "POST",
        headers: { Authorization: `Bearer ${workerSecret}` },
      }).catch((error: unknown) => {
        console.warn("Worker trigger failed after dump confirm (jobs are queued):", error);
      });
    }

    return NextResponse.json(
      {
        count: created.length,
        createdNoteIds: created.map((note) => note.id),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error confirming dump notes:", error);
    return NextResponse.json({ error: "Failed to create dump notes" }, { status: 500 });
  }
}
