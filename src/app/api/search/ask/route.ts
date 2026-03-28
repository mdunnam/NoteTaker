import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import { embedNote, cosineSimilarity } from "@/lib/ai";
import { checkRateLimit } from "@/lib/rateLimit";
import { z } from "zod";

const openaiClient = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

interface AskRequestBody {
  question?: string;
  contextHint?: string;
  remember?: boolean;
}

interface ThinkingMemoryItem {
  ts: string;
  question: string;
  inferredContext: string;
  confidence: number;
  neededClarification: boolean;
}

const AskAssistantPayloadSchema = z.object({
  answer: z.string(),
  inferredContext: z.string(),
  confidence: z.number().min(0).max(1),
  needsClarification: z.boolean(),
  followUpQuestions: z.array(z.string()).max(5),
});

type AskAssistantPayload = z.infer<typeof AskAssistantPayloadSchema>;

/**
 * Build compact note context for assistant prompts.
 */
function buildContext(notes: Array<{ title: string | null; summary: string | null; rawContent: string }>): string {
  return notes
    .map((note, index) => {
      const title = note.title || `Note ${index + 1}`;
      const body = note.summary || note.rawContent.slice(0, 500);
      return `${index + 1}. ${title}\n${body}`;
    })
    .join("\n\n");
}

/**
 * Parse and normalize persisted memory entries.
 */
function parseThinkingMemory(raw: unknown): ThinkingMemoryItem[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((item) => {
      const value = item as Partial<ThinkingMemoryItem>;
      if (!value?.question || !value?.inferredContext) {
        return null;
      }

      return {
        ts: typeof value.ts === "string" ? value.ts : new Date().toISOString(),
        question: value.question,
        inferredContext: value.inferredContext,
        confidence: typeof value.confidence === "number" ? value.confidence : 0,
        neededClarification: Boolean(value.neededClarification),
      };
    })
    .filter((item): item is ThinkingMemoryItem => Boolean(item));
}

/**
 * Build a compact memory summary to help the model adapt over time.
 */
function buildMemoryContext(memory: ThinkingMemoryItem[]): string {
  if (memory.length === 0) {
    return "No prior thinking memory available.";
  }

  return memory
    .slice(-12)
    .map((item, index) => {
      return `${index + 1}. Q: ${item.question}\nInferred context: ${item.inferredContext}\nConfidence: ${item.confidence.toFixed(2)}\nClarification needed: ${item.neededClarification ? "yes" : "no"}`;
    })
    .join("\n\n");
}

/**
 * Parse assistant JSON output with safe fallback.
 */
function parseAssistantPayload(raw: string): AskAssistantPayload {
  try {
    return AskAssistantPayloadSchema.parse(JSON.parse(raw));
  } catch {
    return {
      answer: raw || "I could not generate an answer.",
      inferredContext: "Context could not be inferred reliably.",
      confidence: 0.3,
      needsClarification: true,
      followUpQuestions: [
        "What specific note, project, or timeframe are you referring to?",
        "What outcome are you trying to achieve?",
      ],
    };
  }
}

/**
 * POST /api/search/ask - answer questions, infer context, and generate follow-up clarifications.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rateLimitResult = checkRateLimit(session.user.id, "/api/search/ask");
    if (!rateLimitResult.ok) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again in a moment." },
        { status: 429, headers: { "Retry-After": String(rateLimitResult.retryAfter) } }
      );
    }

    const body = (await request.json()) as AskRequestBody;
    const question = (body.question || "").trim();
    const contextHint = (body.contextHint || "").trim();
    const remember = body.remember !== false;

    if (!question) {
      return NextResponse.json({ error: "Question is required" }, { status: 400 });
    }

    const [notes, preferences] = await Promise.all([
      prisma.note.findMany({
        where: {
          userId: session.user.id,
          isArchived: false,
          status: "PROCESSED",
        },
        select: {
          id: true,
          title: true,
          summary: true,
          rawContent: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
      prisma.userPreferences.findUnique({
        where: { userId: session.user.id },
        select: { thinkingMemory: true },
      }),
    ]);

    const existingMemory = parseThinkingMemory(preferences?.thinkingMemory ?? null);

    let contextNotes = notes;
    try {
      const queryEmbedding = await embedNote(question);
      if (queryEmbedding.length > 0) {
        const scored: Array<{
          id: string;
          title: string | null;
          summary: string | null;
          rawContent: string;
          createdAt: Date;
          score: number;
        }> = [];

        for (const note of notes) {
          const noteText = `${note.title || ""}\n${note.summary || note.rawContent}`.trim();
          const noteEmbedding = await embedNote(noteText);

          if (noteEmbedding.length === 0) {
            continue;
          }

          const score = cosineSimilarity(queryEmbedding, noteEmbedding);
          if (score > 0.5) {
            scored.push({ ...note, score });
          }
        }

        scored.sort((a, b) => b.score - a.score);

        if (scored.length > 0) {
          contextNotes = scored.slice(0, 15).map((item) => ({
            id: item.id,
            title: item.title,
            summary: item.summary,
            rawContent: item.rawContent,
            createdAt: item.createdAt,
          }));
        }
      }
    } catch (embedError) {
      console.warn("Semantic grounding failed, using recent notes:", embedError);
    }

    if (contextNotes.length === 0) {
      return NextResponse.json({
        answer: "No notes available. Capture a few notes first, then ask again.",
        inferredContext: "No notes found.",
        confidence: 0,
        needsClarification: true,
        followUpQuestions: ["Could you capture more context notes first?"],
        sources: [],
      });
    }

    const context = buildContext(contextNotes);
    const memoryContext = buildMemoryContext(existingMemory);

    if (!openaiClient) {
      return NextResponse.json({
        answer: "OpenAI is not configured, so I can only show source notes. Add OPENAI_API_KEY to enable full answers.",
        inferredContext: "OpenAI unavailable.",
        confidence: 0.2,
        needsClarification: true,
        followUpQuestions: [
          "Can you add your OPENAI_API_KEY so I can infer better context?",
          "Can you provide a context hint for this question?",
        ],
        sources: contextNotes.slice(0, 5).map((note) => ({
          id: note.id,
          title: note.title || "Untitled note",
          createdAt: note.createdAt.toISOString(),
        })),
      });
    }

    const completion = await openaiClient.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are an AI note coach. Infer likely context when the question is ambiguous, ask clarifying follow-ups when confidence is low, and output JSON with keys: answer, inferredContext, confidence, needsClarification, followUpQuestions.",
        },
        {
          role: "user",
          content: `User question:\n${question}\n\nOptional user-provided context hint:\n${contextHint || "(none)"}\n\nRecent notes context:\n${context}\n\nLearned thinking memory:\n${memoryContext}`,
        },
      ],
    });

    const rawAnswer = completion.choices[0]?.message?.content || "";
    const payload = parseAssistantPayload(rawAnswer);

    if (remember) {
      const updatedMemory: ThinkingMemoryItem[] = [
        ...existingMemory,
        {
          ts: new Date().toISOString(),
          question,
          inferredContext: payload.inferredContext,
          confidence: payload.confidence,
          neededClarification: payload.needsClarification,
        },
      ].slice(-50);
      const serializedMemory = updatedMemory as unknown as Prisma.InputJsonValue;

      await prisma.userPreferences.upsert({
        where: { userId: session.user.id },
        update: { thinkingMemory: serializedMemory },
        create: {
          userId: session.user.id,
          thinkingMemory: serializedMemory,
        },
      });
    }

    return NextResponse.json({
      answer: payload.answer,
      inferredContext: payload.inferredContext,
      confidence: payload.confidence,
      needsClarification: payload.needsClarification,
      followUpQuestions: payload.followUpQuestions,
      sources: contextNotes.slice(0, 5).map((note) => ({
        id: note.id,
        title: note.title || "Untitled note",
        createdAt: note.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("Error answering note question:", error);
    return NextResponse.json({ error: "Failed to answer question" }, { status: 500 });
  }
}
