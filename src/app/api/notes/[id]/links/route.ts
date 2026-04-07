/**
 * POST /api/notes/[id]/links - create or confirm a note relation.
 */

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const createNoteLinkSchema = z.object({
  targetNoteId: z.string().trim().min(1),
  reason: z.string().trim().max(240).optional(),
  score: z.number().min(0).max(1).optional(),
});

interface Params {
  params: {
    id: string;
  };
}

/** Return note ids in the stable source/target order used by NoteRelation. */
function sortRelationIds(left: string, right: string): [string, string] {
  return [left, right].sort() as [string, string];
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = createNoteLinkSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid note link payload" },
        { status: 400 }
      );
    }

    const { targetNoteId, reason, score } = parsed.data;

    if (targetNoteId === params.id) {
      return NextResponse.json({ error: "A note cannot be linked to itself" }, { status: 400 });
    }

    const availableNotes = await prisma.note.findMany({
      where: {
        userId: session.user.id,
        id: { in: [params.id, targetNoteId] },
      },
      select: { id: true },
    });

    if (availableNotes.length !== 2) {
      return NextResponse.json({ error: "One or both notes were not found" }, { status: 404 });
    }

    const [sourceNoteId, targetRelationId] = sortRelationIds(params.id, targetNoteId);
    const relation = await prisma.noteRelation.upsert({
      where: { sourceNoteId_targetNoteId: { sourceNoteId, targetNoteId: targetRelationId } },
      update: {
        reason: reason || "Accepted from suggested links",
        score: score ?? 0.82,
      },
      create: {
        sourceNoteId,
        targetNoteId: targetRelationId,
        reason: reason || "Accepted from suggested links",
        score: score ?? 0.82,
      },
    });

    return NextResponse.json(relation, { status: 201 });
  } catch (error) {
    console.error("Error creating note link:", error);
    return NextResponse.json({ error: "Failed to create note link" }, { status: 500 });
  }
}