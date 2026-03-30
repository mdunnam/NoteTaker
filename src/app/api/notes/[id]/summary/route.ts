import { auth } from "@/auth";
import { organizeNote } from "@/lib/ai";
import { prisma } from "@/lib/db";
import { checkRateLimit } from "@/lib/rateLimit";
import { buildThinkingMemoryPrompt, getThinkingMemory } from "@/lib/userMemory";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

interface Params {
  params: {
    id: string;
  };
}

const SummaryHintSchema = z.object({
  projectHint: z.string().min(1).max(160).optional(),
  contextHint: z.string().min(1).max(160).optional(),
});

/**
 * POST /api/notes/[id]/summary
 * Regenerate AI summary (and confidence score) for an existing note.
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rateLimitResult = checkRateLimit(session.user.id, "/api/notes/summary");
    if (!rateLimitResult.ok) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again in a moment." },
        { status: 429, headers: { "Retry-After": String(rateLimitResult.retryAfter) } }
      );
    }

    let parsedHints: z.infer<typeof SummaryHintSchema> = {};
    try {
      const rawBody = await request.json();
      const parsed = SummaryHintSchema.safeParse(rawBody);
      if (parsed.success) {
        parsedHints = parsed.data;
      }
    } catch {
      // Empty body is valid for this endpoint.
    }

    const note = await prisma.note.findFirst({
      where: {
        id: params.id,
        userId: session.user.id,
      },
      select: {
        id: true,
        rawContent: true,
        suggestedProject: true,
        category: true,
      },
    });

    if (!note) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    const memory = await getThinkingMemory(session.user.id);
    const organized = await organizeNote(note.rawContent, {
      explicitProject: parsedHints.projectHint || note.suggestedProject || undefined,
      explicitContext: parsedHints.contextHint || note.category || undefined,
      userContext: buildThinkingMemoryPrompt(memory),
    });

    const updated = await prisma.note.update({
      where: { id: note.id },
      data: {
        summary: organized.summary,
        confidenceScore: organized.confidenceScore,
        ...(parsedHints.projectHint && { suggestedProject: parsedHints.projectHint }),
        ...(parsedHints.contextHint && { category: parsedHints.contextHint }),
      },
      select: {
        id: true,
        summary: true,
        confidenceScore: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(updated, { status: 200 });
  } catch (error) {
    console.error("Error regenerating note summary:", error);
    return NextResponse.json({ error: "Failed to regenerate summary" }, { status: 500 });
  }
}
