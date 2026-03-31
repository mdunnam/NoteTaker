import { auth } from "@/auth";
import { organizeNote } from "@/lib/ai";
import { prisma } from "@/lib/db";
import { checkRateLimit } from "@/lib/rateLimit";
import { buildThinkingMemoryPrompt, getThinkingMemory, updateThinkingMemory, recordHintUsage } from "@/lib/userMemory";
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
        confidenceScore: true,
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
        title: organized.title,
        summary: organized.summary,
        category: organized.category,
        type: organized.type,
        tags: organized.tags,
        suggestedProject: organized.suggestedProject || parsedHints.projectHint || null,
        extractedTasks: organized.extractedTasks || null,
        extractedDates: organized.extractedDates || null,
        extractedEntities: organized.extractedEntities || null,
        priority: organized.priority,
        aiMeta: {
          intent: organized.intent || null,
          nextAction: organized.nextAction || null,
          clarificationQuestions: organized.clarificationQuestions || [],
        },
        confidenceScore: organized.confidenceScore,
        ...(parsedHints.contextHint && { category: parsedHints.contextHint }),
      },
      select: {
        id: true,
        title: true,
        summary: true,
        category: true,
        type: true,
        tags: true,
        suggestedProject: true,
        extractedTasks: true,
        priority: true,
        aiMeta: true,
        confidenceScore: true,
        updatedAt: true,
      },
    });

    await updateThinkingMemory(session.user.id, {
      explicitProject: parsedHints.projectHint,
      explicitContext: parsedHints.contextHint,
      organized,
    });

    // Record confidence lift when the user clicked a specific hint chip.
    const confidenceBefore = note.confidenceScore ?? 0;
    const confidenceAfter = updated.confidenceScore ?? 0;
    if (parsedHints.projectHint) {
      await recordHintUsage(session.user.id, parsedHints.projectHint, "project", confidenceBefore, confidenceAfter);
    }
    if (parsedHints.contextHint) {
      await recordHintUsage(session.user.id, parsedHints.contextHint, "context", confidenceBefore, confidenceAfter);
    }

    return NextResponse.json(updated, { status: 200 });
  } catch (error) {
    console.error("Error regenerating note summary:", error);
    return NextResponse.json({ error: "Failed to regenerate summary" }, { status: 500 });
  }
}
