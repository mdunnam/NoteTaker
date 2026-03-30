import { auth } from "@/auth";
import { splitNote } from "@/lib/ai";
import { prisma } from "@/lib/db";
import { checkRateLimit } from "@/lib/rateLimit";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

interface Params {
  params: {
    id: string;
  };
}

const SplitCandidateSchema = z.object({
  content: z.string().min(1).max(10000),
  title: z.string().max(200).optional(),
  category: z.string().max(120).optional(),
  type: z.enum(["TASK", "IDEA", "NOTE", "REFERENCE", "DECISION"]).optional(),
});

const SplitRequestSchema = z.object({
  mode: z.enum(["preview", "create"]).default("preview"),
  maxNotes: z.number().int().min(1).max(8).default(8),
  selectedNotes: z.array(SplitCandidateSchema).optional(),
});

/**
 * POST /api/notes/[id]/split
 * - preview: return split candidates for review
 * - create: create selected split notes and enqueue enrichment
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rateLimitResult = checkRateLimit(session.user.id, "/api/notes/split");
    if (!rateLimitResult.ok) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again in a moment." },
        { status: 429, headers: { "Retry-After": String(rateLimitResult.retryAfter) } }
      );
    }

    const parsedBody = SplitRequestSchema.safeParse(await request.json());
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsedBody.error.flatten() },
        { status: 400 }
      );
    }

    const body = parsedBody.data;

    const sourceNote = await prisma.note.findFirst({
      where: {
        id: params.id,
        userId: session.user.id,
      },
      select: {
        id: true,
        userId: true,
        rawContent: true,
        tags: true,
        collectionId: true,
      },
    });

    if (!sourceNote) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    if (body.mode === "preview") {
      const split = await splitNote(sourceNote.rawContent);
      const notes = split.notes.slice(0, body.maxNotes);

      return NextResponse.json({
        needsSplit: split.needsSplit,
        sourceNoteId: sourceNote.id,
        notes,
      });
    }

    const notesToCreate = body.selectedNotes && body.selectedNotes.length > 0
      ? body.selectedNotes
      : (await splitNote(sourceNote.rawContent)).notes.slice(0, body.maxNotes);

    if (notesToCreate.length === 0) {
      return NextResponse.json({ error: "No split notes selected" }, { status: 400 });
    }

    const createdNotes = await prisma.$transaction(async (tx) => {
      const created = [] as Array<{ id: string }>;

      for (const item of notesToCreate) {
        const note = await tx.note.create({
          data: {
            userId: sourceNote.userId,
            rawContent: item.content.trim(),
            title: item.title?.trim() || null,
            category: item.category?.trim() || null,
            type: item.type || null,
            tags: sourceNote.tags,
            collectionId: sourceNote.collectionId,
            isSplitFrom: sourceNote.id,
            status: "PROCESSING",
          },
          select: { id: true },
        });

        await tx.noteJob.create({
          data: {
            noteId: note.id,
            userId: sourceNote.userId,
          },
        });

        created.push(note);
      }

      return created;
    });

    const baseUrl = request.nextUrl.origin;
    const workerSecret = process.env.WORKER_SECRET;
    if (workerSecret) {
      void fetch(`${baseUrl}/api/worker/enrich`, {
        method: "POST",
        headers: { Authorization: `Bearer ${workerSecret}` },
      }).catch((error: unknown) => {
        console.warn("Worker trigger failed after split create (jobs are queued):", error);
      });
    }

    return NextResponse.json(
      {
        sourceNoteId: sourceNote.id,
        count: createdNotes.length,
        createdNoteIds: createdNotes.map((n) => n.id),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error splitting note:", error);
    return NextResponse.json({ error: "Failed to split note" }, { status: 500 });
  }
}
