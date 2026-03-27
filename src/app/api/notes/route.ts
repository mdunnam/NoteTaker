/**
 * POST /api/notes - Create a new note
 * GET /api/notes - List notes for the current user
 */

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { splitNote } from "@/lib/ai";
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rateLimit";

/**
 * Enqueue an enrichment job and trigger the worker endpoint asynchronously.
 * The job persists in the DB so it survives serverless cold-starts and retries on failure.
 */
async function enqueueEnrichment(noteId: string, userId: string): Promise<void> {
  await prisma.noteJob.create({
    data: { noteId, userId },
  });

  // Trigger the worker without awaiting — the job is safe in the DB regardless
  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const workerSecret = process.env.WORKER_SECRET;
  if (workerSecret) {
    void fetch(`${baseUrl}/api/worker/enrich`, {
      method: "POST",
      headers: { Authorization: `Bearer ${workerSecret}` },
    }).catch((err: unknown) => {
      // Non-fatal: worker will be picked up on next trigger or cron run
      console.warn("Worker trigger failed (job is queued):", err);
    });
  }
}

interface CreateNoteOptions {
  userId: string;
  rawContent: string;
  tags?: string[];
  collectionId?: string | null;
}

/**
 * Create a base note in UNPROCESSED state.
 */
async function createBaseNote(options: CreateNoteOptions) {
  return prisma.note.create({
    data: {
      userId: options.userId,
      rawContent: options.rawContent.trim(),
      tags: options.tags || [],
      collectionId: options.collectionId || null,
      status: "PROCESSING",
    },
  });
}



export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Rate limit check
    const rateLimitResult = checkRateLimit(session.user.id, "/api/notes");
    if (!rateLimitResult.ok) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again in a moment." },
        { status: 429, headers: { "Retry-After": String(rateLimitResult.retryAfter) } }
      );
    }

    const { rawContent, tags, collectionId, autoSplit = true } = await request.json();

    if (!rawContent || !rawContent.trim()) {
      return NextResponse.json(
        { error: "Content is required" },
        { status: 400 }
      );
    }

    const createdNoteIds: string[] = [];

    if (autoSplit) {
      try {
        const split = await splitNote(rawContent);

        if (split.needsSplit && split.notes.length > 1) {
          const limited = split.notes.slice(0, 8);

          for (const splitItem of limited) {
            const created = await createBaseNote({
              userId: session.user.id,
              rawContent: splitItem.content,
              tags,
              collectionId,
            });

            createdNoteIds.push(created.id);

            await enqueueEnrichment(created.id, session.user.id);
          }

          const createdNotes = await prisma.note.findMany({
            where: {
              id: { in: createdNoteIds },
            },
            orderBy: {
              createdAt: "desc",
            },
            include: {
              collection: true,
              entities: {
                include: {
                  entity: true,
                },
              },
            },
          });

          return NextResponse.json(
            {
              split: true,
              count: createdNotes.length,
              notes: createdNotes,
            },
            { status: 201 }
          );
        }
      } catch (splitError) {
        console.error("Error splitting note dump:", splitError);
      }
    }

    const note = await createBaseNote({
      userId: session.user.id,
      rawContent,
      tags,
      collectionId,
    });

    await enqueueEnrichment(note.id, session.user.id);

    const freshNote = await prisma.note.findUnique({
      where: { id: note.id },
      include: {
        collection: true,
        entities: {
          include: {
            entity: true,
          },
        },
      },
    });

    return NextResponse.json(
      {
        split: false,
        count: 1,
        note: freshNote,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating note:", error);
    return NextResponse.json(
      { error: "Failed to create note" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const archived = searchParams.get("archived") === "true";
    const collectionId = searchParams.get("collectionId");

    const notes = await prisma.note.findMany({
      where: {
        userId: session.user.id,
        isArchived: archived,
        ...(collectionId && { collectionId }),
      },
      orderBy: {
        createdAt: "desc",
      },
      include: {
        collection: true,
        entities: {
          include: {
            entity: true,
          },
        },
      },
    });

    return NextResponse.json(notes);
  } catch (error) {
    console.error("Error fetching notes:", error);
    return NextResponse.json(
      { error: "Failed to fetch notes" },
      { status: 500 }
    );
  }
}
