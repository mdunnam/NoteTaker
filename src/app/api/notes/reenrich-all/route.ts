/**
 * POST /api/notes/reenrich-all
 *
 * Marks all of the user's processed notes as UNPROCESSED and queues
 * them for re-enrichment. This runs the full AI pipeline again on every
 * note — useful after identity aliases change, prompt upgrades, or
 * when you want a clean rebuild of all classifications.
 *
 * Returns: { queued: number }
 */

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  // Find all non-archived processed notes
  const notes = await prisma.note.findMany({
    where: { userId, isArchived: false, status: "PROCESSED" },
    select: { id: true },
  });

  if (notes.length === 0) {
    return NextResponse.json({ queued: 0 });
  }

  // Mark all as UNPROCESSED and create NoteJob entries in a transaction
  await prisma.$transaction([
    prisma.note.updateMany({
      where: { userId, isArchived: false, status: "PROCESSED" },
      data: { status: "UNPROCESSED" },
    }),
    ...notes.map((note) =>
      prisma.noteJob.create({ data: { noteId: note.id, userId } })
    ),
    // Bust today's digest cache so it rebuilds after enrichment
    prisma.dailyDigest.deleteMany({
      where: { userId, date: new Date().toISOString().split("T")[0] },
    }),
  ]);

  // Kick the worker once to start processing the queue
  const workerSecret = process.env.WORKER_SECRET;
  if (workerSecret) {
    void fetch(`${req.nextUrl.origin}/api/worker/enrich`, {
      method: "POST",
      headers: { Authorization: `Bearer ${workerSecret}` },
    }).catch(() => {});
  }

  return NextResponse.json({ queued: notes.length });
}
