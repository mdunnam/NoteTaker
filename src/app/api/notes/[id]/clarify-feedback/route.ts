import { auth } from "@/auth";
import { parseNoteAiMeta } from "@/lib/clarification";
import { prisma } from "@/lib/db";
import { checkRateLimit } from "@/lib/rateLimit";
import { recordClarificationQuestionFeedback } from "@/lib/userMemory";
import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

interface Params {
  params: {
    id: string;
  };
}

const ClarifyFeedbackSchema = z.object({
  question: z.string().min(1).max(240),
  action: z.enum(["dismiss"]),
});

/**
 * POST /api/notes/[id]/clarify-feedback
 * Record lightweight feedback on one clarification question and hide it from the current note.
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rateLimitResult = checkRateLimit(session.user.id, "/api/notes/clarify-feedback");
    if (!rateLimitResult.ok) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again in a moment." },
        { status: 429, headers: { "Retry-After": String(rateLimitResult.retryAfter) } }
      );
    }

    const parsedBody = ClarifyFeedbackSchema.safeParse(await request.json());
    if (!parsedBody.success) {
      return NextResponse.json({ error: "Invalid clarification feedback payload" }, { status: 400 });
    }

    const note = await prisma.note.findFirst({
      where: {
        id: params.id,
        userId: session.user.id,
      },
      select: {
        id: true,
        aiMeta: true,
      },
    });

    if (!note) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    const existingAiMeta = note.aiMeta && typeof note.aiMeta === "object" && !Array.isArray(note.aiMeta)
      ? note.aiMeta as Record<string, unknown>
      : {};
    const currentAiMeta = parseNoteAiMeta(note.aiMeta);
    if (!currentAiMeta.clarificationQuestions.includes(parsedBody.data.question)) {
      return NextResponse.json({ error: "Clarification question not found on this note" }, { status: 400 });
    }

    const clarificationQuestions = currentAiMeta.clarificationQuestions.filter(
      (question) => question !== parsedBody.data.question
    );

    const updated = await prisma.note.update({
      where: { id: note.id },
      data: {
        aiMeta: {
          ...existingAiMeta,
          clarificationQuestions,
          clarificationHistory: currentAiMeta.clarificationHistory,
          intent: currentAiMeta.intent,
          nextAction: currentAiMeta.nextAction,
        } as unknown as Prisma.InputJsonValue,
      },
      select: {
        id: true,
        aiMeta: true,
      },
    });

    await recordClarificationQuestionFeedback(session.user.id, parsedBody.data.question, "dismissed");

    return NextResponse.json(updated, { status: 200 });
  } catch (error) {
    console.error("Error recording clarification feedback:", error);
    return NextResponse.json({ error: "Failed to record clarification feedback" }, { status: 500 });
  }
}