import { auth } from "@/auth";
import { synthesizeNotes } from "@/lib/ai";
import { prisma } from "@/lib/db";
import { checkRateLimit } from "@/lib/rateLimit";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const SynthesisRequestSchema = z.object({
  noteIds: z.array(z.string().min(1)).min(2).max(12),
  planningGoal: z.string().trim().max(240).optional(),
});

/**
 * POST /api/synthesis
 * Build a synthesis across multiple notes the user selected.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rateLimitResult = checkRateLimit(session.user.id, "/api/synthesis");
    if (!rateLimitResult.ok) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again in a moment." },
        { status: 429, headers: { "Retry-After": String(rateLimitResult.retryAfter) } }
      );
    }

    const parsedBody = SynthesisRequestSchema.safeParse(await request.json());
    if (!parsedBody.success) {
      return NextResponse.json({ error: "Invalid synthesis payload" }, { status: 400 });
    }

    const notes = await prisma.note.findMany({
      where: {
        userId: session.user.id,
        id: { in: parsedBody.data.noteIds },
      },
      select: {
        id: true,
        title: true,
        summary: true,
        rawContent: true,
        category: true,
        suggestedProject: true,
        createdAt: true,
      },
    });

    if (notes.length < 2) {
      return NextResponse.json({ error: "Select at least two valid notes to synthesize" }, { status: 400 });
    }

    const synthesis = await synthesizeNotes(notes.map((note) => ({
      ...note,
      createdAt: note.createdAt.toISOString(),
    })), {
      planningGoal: parsedBody.data.planningGoal?.trim() || undefined,
    });

    return NextResponse.json(synthesis, { status: 200 });
  } catch (error) {
    console.error("Error synthesizing notes:", error);
    return NextResponse.json({ error: "Failed to synthesize notes" }, { status: 500 });
  }
}