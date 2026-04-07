import { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { cosineSimilarity } from "@/lib/ai";
import { getNoteKnowledgeContext } from "@/lib/clusters";
import { prisma } from "@/lib/db";
import { buildContextAwareResurfacing, parseDuplicateSuggestion, type ContextualResurfacingMatch, type SimilarityCandidate } from "@/lib/overlapSignals";
import { parsePgVectorLiteral } from "@/lib/pgvector";
import { NextRequest, NextResponse } from "next/server";

interface Params {
  params: {
    id: string;
  };
}

interface InsightClusterNote {
  id: string;
  title: string | null;
  summary: string | null;
  createdAt: string;
}

interface InsightCluster {
  id: string;
  kind: "project" | "topic";
  label: string;
  noteCount: number;
  dominantCategory: string | null;
  crossReferences: string[];
  notes: InsightClusterNote[];
}

interface UnresolvedThread {
  label: string;
  kind: "project" | "topic";
  mentionCount: number;
  notes: InsightClusterNote[];
}

interface SuggestedLink {
  id: string;
  title: string | null;
  summary: string | null;
  score: number;
  reason: string;
}

type RelatedSimilarityCandidate = SimilarityCandidate;

/** Pick the strongest repeated cluster for the note and frame it as an unresolved thread. */
function buildUnresolvedThread(noteId: string, clusters: InsightCluster[]): UnresolvedThread | null {
  const strongestCluster = [...clusters]
    .filter((cluster) => cluster.noteCount >= 3)
    .sort((left, right) => right.noteCount - left.noteCount)[0];

  if (!strongestCluster) {
    return null;
  }

  const priorNotes = strongestCluster.notes
    .filter((note) => note.id !== noteId)
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, 3);

  if (priorNotes.length === 0) {
    return null;
  }

  return {
    label: strongestCluster.label,
    kind: strongestCluster.kind,
    mentionCount: strongestCluster.noteCount,
    notes: priorNotes,
  };
}

/** Explain why one candidate was suggested as a manual link target. */
function buildSuggestedLinkReason(
  current: { suggestedProject: string | null; category: string | null },
  candidate: { suggestedProject: string | null; category: string | null }
): string {
  const sharedSignals: string[] = [];

  if (current.suggestedProject && candidate.suggestedProject === current.suggestedProject) {
    sharedSignals.push("shared project context");
  }

  if (current.category && candidate.category === current.category) {
    sharedSignals.push("same category");
  }

  if (sharedSignals.length === 0) {
    return "High semantic overlap without a saved relation yet.";
  }

  return `High semantic overlap with ${sharedSignals.join(" and ")}.`;
}

/** Find semantically similar notes that are not already linked through NoteRelation. */
async function getSuggestedLinksForNote(options: {
  userId: string;
  noteId: string;
  suggestedProject: string | null;
  category: string | null;
  excludedIds: string[];
}): Promise<SuggestedLink[]> {
  const candidates = await prisma.note.findMany({
    where: {
      userId: options.userId,
      id: { notIn: options.excludedIds },
      isArchived: false,
      status: "PROCESSED",
    },
    select: {
      id: true,
      title: true,
      summary: true,
      suggestedProject: true,
      category: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 60,
  });

  if (candidates.length === 0) {
    return [];
  }

  const embeddingIds = [options.noteId, ...candidates.map((candidate) => candidate.id)];
  const rows = await prisma.$queryRaw<Array<{ id: string; embeddingText: string | null }>>(
    Prisma.sql`
      SELECT "id", "embedding"::text AS "embeddingText"
      FROM "Note"
      WHERE "id" IN (${Prisma.join(embeddingIds)})
    `
  );

  const embeddingById = new Map(rows.map((row) => [row.id, parsePgVectorLiteral(row.embeddingText)]));
  const sourceEmbedding = embeddingById.get(options.noteId) || [];

  if (sourceEmbedding.length === 0) {
    return [];
  }

  return candidates
    .map((candidate) => {
      const candidateEmbedding = embeddingById.get(candidate.id) || [];
      if (candidateEmbedding.length === 0) {
        return null;
      }

      const score = cosineSimilarity(sourceEmbedding, candidateEmbedding);
      if (score < 0.78) {
        return null;
      }

      return {
        id: candidate.id,
        title: candidate.title,
        summary: candidate.summary,
        score,
        reason: buildSuggestedLinkReason(
          {
            suggestedProject: options.suggestedProject,
            category: options.category,
          },
          {
            suggestedProject: candidate.suggestedProject,
            category: candidate.category,
          }
        ),
      } satisfies SuggestedLink;
    })
    .filter((candidate): candidate is SuggestedLink => !!candidate)
    .sort((left, right) => right.score - left.score)
    .slice(0, 3);
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
        collectionId: true,
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
              select: {
                id: true,
                title: true,
                summary: true,
                createdAt: true,
                suggestedProject: true,
                category: true,
              },
            },
          },
        },
        relatedNotesTo: {
          orderBy: { score: "desc" },
          take: 4,
          select: {
            score: true,
            sourceNote: {
              select: {
                id: true,
                title: true,
                summary: true,
                createdAt: true,
                suggestedProject: true,
                category: true,
              },
            },
          },
        },
      },
    });

    if (!note) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    const parsedAiMeta = note.aiMeta && typeof note.aiMeta === "object" && !Array.isArray(note.aiMeta)
      ? note.aiMeta as Record<string, unknown>
      : {};
    const duplicateSuggestion = parseDuplicateSuggestion(parsedAiMeta.duplicateSuggestion);

    const relatedCandidates: RelatedSimilarityCandidate[] = [
      ...note.relatedNotesFrom.map((r) => ({
        id: r.targetNote.id,
        title: r.targetNote.title,
        summary: r.targetNote.summary,
        createdAt: r.targetNote.createdAt,
        suggestedProject: r.targetNote.suggestedProject,
        category: r.targetNote.category,
        score: r.score,
      })),
      ...note.relatedNotesTo.map((r) => ({
        id: r.sourceNote.id,
        title: r.sourceNote.title,
        summary: r.sourceNote.summary,
        createdAt: r.sourceNote.createdAt,
        suggestedProject: r.sourceNote.suggestedProject,
        category: r.sourceNote.category,
        score: r.score,
      })),
    ];

    const related = [...relatedCandidates]
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);
    const contextMatches = buildContextAwareResurfacing(
      note.createdAt,
      {
        suggestedProject: note.suggestedProject,
        category: note.category,
      },
      relatedCandidates.filter((candidate) => candidate.score >= 0.78 && candidate.id !== duplicateSuggestion?.note.id),
      2
    );

    const [knowledgeContext, collections] = await Promise.all([
      getNoteKnowledgeContext(session.user.id, params.id),
      prisma.collection.findMany({
        where: { userId: session.user.id },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          color: true,
        },
      }),
    ]);
    const clusters = (knowledgeContext?.clusters || []) as InsightCluster[];
    const unresolvedThread = buildUnresolvedThread(note.id, clusters);
    const suggestedLinks = await getSuggestedLinksForNote({
      userId: session.user.id,
      noteId: note.id,
      suggestedProject: note.suggestedProject,
      category: note.category,
      excludedIds: [note.id, ...related.map((candidate) => candidate.id)],
    });

    return NextResponse.json({
      noteId: note.id,
      note: {
        id: note.id,
        title: note.title,
        summary: note.summary,
        category: note.category,
        suggestedProject: note.suggestedProject,
        collectionId: note.collectionId,
        confidenceScore: note.confidenceScore,
        priority: note.priority,
        status: note.status,
        createdAt: note.createdAt.toISOString(),
        updatedAt: note.updatedAt.toISOString(),
      },
      aiMeta: note.aiMeta,
      extractedTasks: note.extractedTasks,
      clusters,
      reorganizationSuggestion: knowledgeContext?.suggestion || null,
      related,
      duplicateSuggestion,
      contextMatches,
      unresolvedThread,
      suggestedLinks,
      collections,
    });
  } catch (error) {
    console.error("Error fetching note insights:", error);
    return NextResponse.json({ error: "Failed to fetch insights" }, { status: 500 });
  }
}
