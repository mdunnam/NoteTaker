import { auth } from "@/auth";
import { organizeNote, splitNote } from "@/lib/ai";
import { checkRateLimit } from "@/lib/rateLimit";
import { buildThinkingMemoryPrompt, getThinkingMemory } from "@/lib/userMemory";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const AnalyzeDumpSchema = z.object({
  rawText: z.string().min(1).max(50000),
  maxNotes: z.number().int().min(1).max(8).default(8).optional(),
});

/**
 * POST /api/notes/analyze-dump
 * Analyze raw dump text and return organized split-note previews.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rateLimitResult = checkRateLimit(session.user.id, "/api/notes/analyze-dump");
    if (!rateLimitResult.ok) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again in a moment." },
        { status: 429, headers: { "Retry-After": String(rateLimitResult.retryAfter) } }
      );
    }

    const parsed = AnalyzeDumpSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { rawText, maxNotes = 8 } = parsed.data;
    const memory = await getThinkingMemory(session.user.id);

    const split = await splitNote(rawText);
    const chunks = split.needsSplit
      ? split.notes.slice(0, maxNotes).map((note) => note.content)
      : [rawText.trim()];

    const organizedSplits = await Promise.all(
      chunks.map(async (content) => {
        const organized = await organizeNote(content, {
          userContext: buildThinkingMemoryPrompt(memory),
        });

        return {
          rawContent: content,
          title: organized.title,
          summary: organized.summary,
          category: organized.category,
          type: organized.type,
          priority: organized.priority,
          tags: organized.tags,
          suggestedProject: organized.suggestedProject || null,
          extractedTasks: organized.extractedTasks || [],
          confidenceScore: organized.confidenceScore,
        };
      })
    );

    return NextResponse.json(
      {
        needsSplit: split.needsSplit,
        count: organizedSplits.length,
        splits: organizedSplits,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error analyzing dump:", error);
    return NextResponse.json({ error: "Failed to analyze dump" }, { status: 500 });
  }
}
