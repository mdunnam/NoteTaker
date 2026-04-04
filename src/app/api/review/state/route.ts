import { auth } from "@/auth";
import { checkRateLimit } from "@/lib/rateLimit";
import { suppressReviewItem } from "@/lib/userMemory";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const ReviewStateSchema = z.object({
  kind: z.enum(["forgotten-note", "pattern"]),
  targetId: z.string().min(1).max(200),
  action: z.enum(["snooze", "dismiss"]),
});

const ACTION_TO_DAYS: Record<"snooze" | "dismiss", number> = {
  snooze: 7,
  dismiss: 30,
};

/**
 * POST /api/review/state
 * Persist snooze or dismiss windows for review items.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rateLimitResult = checkRateLimit(session.user.id, "/api/review/state");
    if (!rateLimitResult.ok) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again in a moment." },
        { status: 429, headers: { "Retry-After": String(rateLimitResult.retryAfter) } }
      );
    }

    const parsedBody = ReviewStateSchema.safeParse(await request.json());
    if (!parsedBody.success) {
      return NextResponse.json({ error: "Invalid review action payload" }, { status: 400 });
    }

    const durationDays = ACTION_TO_DAYS[parsedBody.data.action];
    const until = await suppressReviewItem(
      session.user.id,
      parsedBody.data.kind,
      parsedBody.data.targetId,
      durationDays
    );

    return NextResponse.json(
      {
        success: true,
        kind: parsedBody.data.kind,
        targetId: parsedBody.data.targetId,
        action: parsedBody.data.action,
        until,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error updating review state:", error);
    return NextResponse.json({ error: "Failed to update review state" }, { status: 500 });
  }
}