import { auth } from "@/auth";
import { organizeNote } from "@/lib/ai";
import { Prisma } from "@prisma/client";
import {
  appendClarificationTurn,
  buildClarificationContext,
  parseNoteAiMeta,
} from "@/lib/clarification";
import { prisma } from "@/lib/db";
import { checkRateLimit } from "@/lib/rateLimit";
import {
  buildThinkingMemoryPrompt,
  getThinkingMemory,
  recordHintUsage,
  updateThinkingMemory,
} from "@/lib/userMemory";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

interface Params {
  params: {
    id: string;
  };
}

const ClarifyNoteSchema = z
  .object({
    question: z.string().min(1).max(240).optional(),
    answer: z.string().min(1).max(1000).optional(),
    projectHint: z.string().min(1).max(160).optional(),
    contextHint: z.string().min(1).max(160).optional(),
  })
  .refine(
    (value) => Boolean(value.answer?.trim() || value.projectHint?.trim() || value.contextHint?.trim()),
    "A clarification answer or hint is required"
  );

/**
 * POST /api/notes/[id]/clarify
 * Continue the note clarification conversation and regenerate organization.
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rateLimitResult = checkRateLimit(session.user.id, "/api/notes/clarify");
    if (!rateLimitResult.ok) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again in a moment." },
        { status: 429, headers: { "Retry-After": String(rateLimitResult.retryAfter) } }
      );
    }

    const parsedBody = ClarifyNoteSchema.safeParse(await request.json());
    if (!parsedBody.success) {
      return NextResponse.json({ error: "Invalid clarification payload" }, { status: 400 });
    }

    const body = parsedBody.data;
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
    let clarificationHistory = [...currentAiMeta.clarificationHistory];
    const baseQuestion =
      body.question ||
      currentAiMeta.clarificationQuestions[0] ||
      "What does this note need clarified?";

    if (body.answer?.trim()) {
      clarificationHistory = appendClarificationTurn(clarificationHistory, {
        question: baseQuestion,
        answer: body.answer.trim(),
        kind: "freeform",
        createdAt: new Date().toISOString(),
      });
    }

    if (body.projectHint?.trim()) {
      clarificationHistory = appendClarificationTurn(clarificationHistory, {
        question: baseQuestion,
        answer: body.projectHint.trim(),
        kind: "project",
        createdAt: new Date().toISOString(),
      });
    }

    if (body.contextHint?.trim()) {
      clarificationHistory = appendClarificationTurn(clarificationHistory, {
        question: baseQuestion,
        answer: body.contextHint.trim(),
        kind: "context",
        createdAt: new Date().toISOString(),
      });
    }

    const memory = await getThinkingMemory(session.user.id);
    const organized = await organizeNote(note.rawContent, {
      explicitProject: body.projectHint || note.suggestedProject || undefined,
      explicitContext: body.contextHint || note.category || undefined,
      userContext: buildThinkingMemoryPrompt(memory),
      clarificationContext: buildClarificationContext(clarificationHistory),
    });

    const updated = await prisma.note.update({
      where: { id: note.id },
      data: {
        title: organized.title,
        summary: organized.summary,
        category: body.contextHint || organized.category,
        type: organized.type,
        tags: organized.tags,
        suggestedProject: organized.suggestedProject || body.projectHint || null,
        extractedTasks: organized.extractedTasks || null,
        extractedDates: organized.extractedDates || null,
        extractedEntities: organized.extractedEntities || null,
        priority: organized.priority,
        aiMeta: {
          ...existingAiMeta,
          intent: organized.intent || null,
          nextAction: organized.nextAction || null,
          clarificationQuestions: organized.clarificationQuestions || [],
          clarificationHistory,
        } as unknown as Prisma.InputJsonValue,
        confidenceScore: organized.confidenceScore,
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
      explicitProject: body.projectHint,
      explicitContext: body.contextHint,
      organized,
    });

    const confidenceBefore = note.confidenceScore ?? 0;
    const confidenceAfter = updated.confidenceScore ?? 0;
    if (body.projectHint) {
      await recordHintUsage(session.user.id, body.projectHint, "project", confidenceBefore, confidenceAfter);
    }
    if (body.contextHint) {
      await recordHintUsage(session.user.id, body.contextHint, "context", confidenceBefore, confidenceAfter);
    }

    return NextResponse.json(updated, { status: 200 });
  } catch (error) {
    console.error("Error clarifying note:", error);
    return NextResponse.json({ error: "Failed to clarify note" }, { status: 500 });
  }
}