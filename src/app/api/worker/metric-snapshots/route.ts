import { backfillRecentMetricSnapshotsForAllUsers, ensureRecentUserMetricSnapshots } from "@/lib/userStats";
import { NextRequest, NextResponse } from "next/server";

/** Verify the request carries a valid worker secret. */
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
 * POST /api/worker/metric-snapshots
 * Backfill missing daily metric snapshots for one user or all users.
 */
async function handleWorker(request: NextRequest) {
  if (!isAuthorised(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = request.method === "POST"
    ? await request.json().catch(() => ({} as { userId?: string; days?: number }))
    : ({} as { userId?: string; days?: number });

  const days = typeof body.days === "number" && body.days >= 1 && body.days <= 90 ? body.days : 30;

  if (body.userId) {
    const snapshotsCreated = await ensureRecentUserMetricSnapshots(body.userId, days);
    return NextResponse.json({
      mode: "single-user",
      userId: body.userId,
      days,
      snapshotsCreated,
    });
  }

  const result = await backfillRecentMetricSnapshotsForAllUsers(days);
  return NextResponse.json({
    mode: "all-users",
    days,
    ...result,
  });
}

export async function POST(request: NextRequest) {
  return handleWorker(request);
}

export async function GET(request: NextRequest) {
  return handleWorker(request);
}
