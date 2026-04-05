import { auth } from "@/auth";
import { getNoteKnowledgeContext } from "@/lib/clusters";
import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

interface Params {
  params: {
    id: string;
  };
}

/**
 * GET /api/notes/[id]/insights
 * Returns contextual AI insights for a single note.
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const note = await prisma.note.findFirst({
      where: {
        id: params.id,
        userId: session.user.id,
      },
      select: {
        id: true,
        title: true,
        summary: true,
        category: true,
        suggestedProject: true,
        confidenceScore: true,
        priority: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        aiMeta: true,
        extractedTasks: true,
        relatedNotesFrom: {
          orderBy: { score: "desc" },
          take: 4,
          select: {
            score: true,
            targetNote: {
              select: { id: true, title: true, summary: true },
            },
          },
        },
        relatedNotesTo: {
          orderBy: { score: "desc" },
          take: 4,
          select: {
            score: true,
            sourceNote: {
              select: { id: true, title: true, summary: true },
            },
          },
        },
      },
    });

    if (!note) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    const knowledgeContext = await getNoteKnowledgeContext(session.user.id, params.id);

    return NextResponse.json({
      noteId: note.id,
      note: {
        id: note.id,
        title: note.title,
        summary: note.summary,
        category: note.category,
        suggestedProject: note.suggestedProject,
        confidenceScore: note.confidenceScore,
        priority: note.priority,
        status: note.status,
        createdAt: note.createdAt.toISOString(),
        updatedAt: note.updatedAt.toISOString(),
      },
      aiMeta: note.aiMeta,
      extractedTasks: note.extractedTasks,
      clusters: knowledgeContext?.clusters || [],
      reorganizationSuggestion: knowledgeContext?.suggestion || null,
      related: [
        ...note.relatedNotesFrom.map((r) => ({
          id: r.targetNote.id,
          title: r.targetNote.title,
          summary: r.targetNote.summary,
          score: r.score,
        })),
        ...note.relatedNotesTo.map((r) => ({
          id: r.sourceNote.id,
          title: r.sourceNote.title,
          summary: r.sourceNote.summary,
          score: r.score,
        })),
      ]
        .sort((a, b) => b.score - a.score)
        .slice(0, 4),
    });
  } catch (error) {
    console.error("Error fetching note insights:", error);
    return NextResponse.json({ error: "Failed to fetch insights" }, { status: 500 });
  }
}
