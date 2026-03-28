/**
 * POST /api/worker/enrich
 *
 * Processes one pending NoteJob at a time with up to maxAttempts retries.
 * Secured with a shared WORKER_SECRET so only authorised callers may invoke it.
 * Can be triggered by:
 *   - The note creation endpoint (fire-and-forget HTTP call)
 *   - A Vercel Cron Job for stale-job recovery
 */

import { prisma } from "@/lib/db";
import { enrichNote } from "@/lib/enrichNote";
import { NextRequest, NextResponse } from "next/server";

const STALE_JOB_MINUTES = 10;

/**
 * Verify the request carries a valid worker secret.
 */
function isAuthorised(request: NextRequest): boolean {
  const workerSecret = process.env.WORKER_SECRET;
  const cronSecret = process.env.CRON_SECRET;

  if (!workerSecret && !cronSecret) return false;

  const auth = request.headers.get("Authorization") ?? "";
  if (workerSecret && auth === `Bearer ${workerSecret}`) {
    return true;
  }

  if (cronSecret && auth === `Bearer ${cronSecret}`) {
    return true;
  }

  return false;
}

/**
 * Process one queued enrichment job.
 */
async function handleWorker(request: NextRequest) {
  if (!isAuthorised(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Also pick up stale PROCESSING jobs (function that timed out without completing)
  const staleThreshold = new Date(Date.now() - STALE_JOB_MINUTES * 60 * 1000);

  // NOTE: Prisma does not support column-to-column comparisons in where clauses,
  // so we fetch FAILED jobs and filter in JS for attempts < maxAttempts.
  const [pendingJob, stalledJob] = await Promise.all([
    prisma.noteJob.findFirst({
      where: { OR: [{ status: "PENDING" }, { status: "FAILED" }] },
      orderBy: { scheduledAt: "asc" },
      include: { note: { select: { rawContent: true, tags: true } } },
    }),
    prisma.noteJob.findFirst({
      where: { status: "PROCESSING", updatedAt: { lt: staleThreshold } },
      orderBy: { scheduledAt: "asc" },
      include: { note: { select: { rawContent: true, tags: true } } },
    }),
  ]);

  const job = stalledJob ?? (pendingJob && pendingJob.attempts < pendingJob.maxAttempts ? pendingJob : null);

  if (!job) {
    return NextResponse.json({ message: "No jobs pending" }, { status: 200 });
  }

  // Claim the job atomically
  await prisma.noteJob.update({
    where: { id: job.id },
    data: { status: "PROCESSING", attempts: { increment: 1 } },
  });

  try {
    await enrichNote({
      noteId: job.noteId,
      userId: job.userId,
      rawContent: job.note.rawContent,
      fallbackTags: job.note.tags,
    });

    await prisma.noteJob.update({
      where: { id: job.id },
      data: { status: "DONE", processedAt: new Date(), lastError: null },
    });

    return NextResponse.json({ jobId: job.id, status: "DONE" }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const isFinal = job.attempts + 1 >= job.maxAttempts;

    await prisma.noteJob.update({
      where: { id: job.id },
      data: {
        status: isFinal ? "FAILED" : "PENDING",
        lastError: message,
      },
    });

    console.error(`NoteJob ${job.id} failed (attempt ${job.attempts + 1}):`, message);

    return NextResponse.json(
      { jobId: job.id, status: isFinal ? "FAILED" : "RETRYING", error: message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  return handleWorker(request);
}

// Vercel Cron invokes GET requests, so support GET as well.
export async function GET(request: NextRequest) {
  return handleWorker(request);
}
