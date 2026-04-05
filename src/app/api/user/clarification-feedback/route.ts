import { auth } from "@/auth";
import {
  getClarificationQuestionStats,
  restoreClarificationQuestionFeedback,
} from "@/lib/userMemory";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const ClarificationFeedbackRestoreSchema = z.object({
  key: z.string().min(1).max(160),
  action: z.enum(["restore"]),
});

/**
 * POST /api/user/clarification-feedback
 * Restore one clarification style so future prompts can surface it again if needed.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsedBody = ClarificationFeedbackRestoreSchema.safeParse(await request.json());
    if (!parsedBody.success) {
      return NextResponse.json({ error: "Invalid clarification feedback payload" }, { status: 400 });
    }

    const stats = await getClarificationQuestionStats(session.user.id);
    const existing = stats.find((stat) => stat.key === parsedBody.data.key);

    if (!existing) {
      return NextResponse.json({ error: "Clarification style not found" }, { status: 404 });
    }

    const restored = await restoreClarificationQuestionFeedback(session.user.id, parsedBody.data.key);
    if (!restored) {
      return NextResponse.json({ error: "Clarification style not found" }, { status: 404 });
    }

    return NextResponse.json(
      {
        key: existing.key,
        label: existing.label,
        action: "restored",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error restoring clarification feedback:", error);
    return NextResponse.json({ error: "Failed to restore clarification feedback" }, { status: 500 });
  }
}