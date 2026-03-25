import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";

const openaiClient = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

interface AskRequestBody {
  question?: string;
}

/**
 * Build compact note context for QA prompts.
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
 * POST /api/search/ask - answer a user question using note context.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as AskRequestBody;
    const question = (body.question || "").trim();

    if (!question) {
      return NextResponse.json({ error: "Question is required" }, { status: 400 });
    }

    const notes = await prisma.note.findMany({
      where: {
        userId: session.user.id,
        isArchived: false,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 25,
      select: {
        id: true,
        title: true,
        summary: true,
        rawContent: true,
        createdAt: true,
      },
    });

    if (notes.length === 0) {
      return NextResponse.json({
        answer: "No notes yet. Capture a few notes first, then ask again.",
        sources: [],
      });
    }

    const context = buildContext(notes);

    if (!openaiClient) {
      return NextResponse.json({
        answer: "OpenAI is not configured, so I can only show source notes. Add OPENAI_API_KEY to enable full answers.",
        sources: notes.slice(0, 5).map((note) => ({
          id: note.id,
          title: note.title || "Untitled note",
          createdAt: note.createdAt.toISOString(),
        })),
      });
    }

    const completion = await openaiClient.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You answer questions using only the provided notes context. If context is insufficient, say so clearly and suggest what note detail is missing.",
        },
        {
          role: "user",
          content: `Question:\n${question}\n\nNotes Context:\n${context}`,
        },
      ],
    });

    const answer = completion.choices[0]?.message?.content?.trim() || "I could not generate an answer.";

    return NextResponse.json({
      answer,
      sources: notes.slice(0, 5).map((note) => ({
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
