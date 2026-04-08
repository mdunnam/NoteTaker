/**
 * AI enrichment pipeline for a single note.
 * Shared between the legacy fire-and-forget path and the durable job queue.
 */

import { Prisma } from "@prisma/client";
import { rescoreUserReclassificationQueue } from "@/lib/clusters";
import { prisma } from "@/lib/db";
import { cosineSimilarity, embedNote, embedNotes, organizeNote } from "@/lib/ai";
import { buildDuplicateSuggestion, type SimilarityCandidate } from "@/lib/overlapSignals";
import { toPgVectorLiteral } from "@/lib/pgvector";
import {
  buildThinkingMemoryPrompt,
  getThinkingMemory,
  updateThinkingMemory,
} from "@/lib/userMemory";

export interface EnrichNoteOptions {
  noteId: string;
  userId: string;
  rawContent: string;
  fallbackTags?: string[];
}

/**
 * Persist an embedding into the pgvector-backed Note.embedding column.
 */
async function persistNoteEmbedding(noteId: string, embedding: number[]): Promise<void> {
  if (embedding.length === 0) return;
  const literal = toPgVectorLiteral(embedding);
  await prisma.$executeRaw(
    Prisma.sql`UPDATE "Note" SET "embedding" = ${literal}::vector WHERE "id" = ${noteId}`
  );
}

/**
 * Build a compact corpus context string from recent notes so the AI can
 * reason about this new note in the context of everything the user has written.
 */
function buildCorpusContext(
  recentNotes: Array<{
    id: string;
    title: string | null;
    summary: string | null;
    category: string | null;
    suggestedProject: string | null;
    createdAt: Date;
    extractedTasks: Prisma.JsonValue;
  }>
): string {
  if (recentNotes.length === 0) return "";

  const now = Date.now();
  const lines: string[] = ["Recent notes (use for context, cross-referencing, and deduplication):"];

  for (const note of recentNotes.slice(0, 20)) {
    const daysAgo = Math.round((now - new Date(note.createdAt).getTime()) / 86400000);
    const tasks = Array.isArray(note.extractedTasks)
      ? (note.extractedTasks as Array<{ text: string; completed?: boolean }>)
          .filter((t) => !t.completed)
          .map((t) => t.text)
          .slice(0, 2)
      : [];
    const taskStr = tasks.length > 0 ? ` | open tasks: ${tasks.join("; ")}` : "";
    lines.push(
      `- [${daysAgo}d ago] "${note.title || "Untitled"}" (${note.category || "?"} / ${note.suggestedProject || "no project"})${taskStr}`
    );
  }

  return lines.join("\n");
}

/**
 * Run AI enrichment, entity linking, and relation scoring for a note.
 * Marks the note PROCESSED on success or applies a minimal fallback on failure.
 */
export async function enrichNote(options: EnrichNoteOptions): Promise<void> {
  const { noteId, userId, rawContent, fallbackTags } = options;

  try {
    const [currentNoteHints, thinkingMemory, recentNotes] = await Promise.all([
      prisma.note.findUnique({
        where: { id: noteId },
        select: { suggestedProject: true, category: true, aiMeta: true },
      }),
      getThinkingMemory(userId),
      // Fetch recent notes for corpus context — exclude the note being enriched
      prisma.note.findMany({
        where: { userId, isArchived: false, status: "PROCESSED", id: { not: noteId } },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          title: true,
          summary: true,
          category: true,
          suggestedProject: true,
          createdAt: true,
          extractedTasks: true,
        },
      }),
    ]);

    const existingAiMeta = currentNoteHints?.aiMeta && typeof currentNoteHints.aiMeta === "object" && !Array.isArray(currentNoteHints.aiMeta)
      ? currentNoteHints.aiMeta as Record<string, unknown>
      : {};

    // Build corpus context for cross-note reasoning
    const corpusContext = buildCorpusContext(recentNotes);

    const organized = await organizeNote(rawContent, {
      explicitProject: currentNoteHints?.suggestedProject || undefined,
      explicitContext: currentNoteHints?.category || undefined,
      userContext: buildThinkingMemoryPrompt(thinkingMemory),
      corpusContext: corpusContext || undefined,
      identityAliases: thinkingMemory.identityAliases,
      clarificationQuestionStats: thinkingMemory.clarificationQuestionStats,
    });


    const baseAiMeta = {
      ...existingAiMeta,
      intent: organized.intent || null,
      nextAction: organized.nextAction || null,
      clarificationQuestions: organized.clarificationQuestions || [],
    };

    await prisma.note.update({
      where: { id: noteId },
      data: {
        title: organized.title,
        summary: organized.summary,
        category: organized.category,
        type: organized.type,
        tags: organized.tags.length > 0 ? organized.tags : fallbackTags || [],
        suggestedProject: organized.suggestedProject || null,
        extractedTasks: organized.extractedTasks || null,
        extractedDates: organized.extractedDates || null,
        extractedEntities: organized.extractedEntities || null,
        confidenceScore: organized.confidenceScore,
        priority: organized.priority || "medium",
        aiMeta: baseAiMeta as unknown as Prisma.InputJsonValue,
        status: "PROCESSED",
      },
    });

    const extractedEntities = organized.extractedEntities || [];

    for (const extractedEntity of extractedEntities) {
      const normalizedName = extractedEntity.name.trim();
      if (!normalizedName) continue;

      const entity = await prisma.entity.upsert({
        where: {
          userId_type_name: { userId, type: extractedEntity.type, name: normalizedName },
        },
        update: {},
        create: {
          userId,
          type: extractedEntity.type,
          name: normalizedName,
          permalink: normalizedName.toLowerCase().replace(/\s+/g, "-"),
        },
      });

      await prisma.noteEntity.upsert({
        where: { noteId_entityId: { noteId, entityId: entity.id } },
        update: { mentionCount: { increment: 1 } },
        create: { noteId, entityId: entity.id, mentionCount: 1 },
      });
    }

    try {
      await updateThinkingMemory(userId, {
        explicitProject: currentNoteHints?.suggestedProject || undefined,
        explicitContext: currentNoteHints?.category || undefined,
        organized,
      });
    } catch (memoryError) {
      console.error("Error updating user thinking memory:", memoryError);
    }

    // Build similarity relations using on-the-fly embeddings
    try {
      const sourceText = `${organized.title || ""}\n${organized.summary || rawContent}`.trim();
      const sourceEmbedding = await embedNote(sourceText);

      if (sourceEmbedding.length > 0) {
        await persistNoteEmbedding(noteId, sourceEmbedding);

        const candidates = await prisma.note.findMany({
          where: {
            userId,
            id: { not: noteId },
            isArchived: false,
            status: "PROCESSED",
          },
          select: {
            id: true,
            title: true,
            summary: true,
            rawContent: true,
            createdAt: true,
            suggestedProject: true,
            category: true,
          },
          orderBy: { createdAt: "desc" },
          take: 25,
        });

        // Batch all candidate embeddings in a single API call instead of N individual calls
        const candidateTexts = candidates.map((c) =>
          `${c.title || ""}\n${c.summary || c.rawContent}`.trim()
        );
        const candidateEmbeddings = candidateTexts.length > 0
          ? await embedNotes(candidateTexts)
          : [];

        const scored: SimilarityCandidate[] = [];

        for (let i = 0; i < candidates.length; i++) {
          const candidateEmbedding = candidateEmbeddings[i];
          if (!candidateEmbedding || candidateEmbedding.length === 0) continue;

          const score = cosineSimilarity(sourceEmbedding, candidateEmbedding);
          if (score >= 0.78) {
            const candidate = candidates[i];
            scored.push({
              id: candidate.id,
              title: candidate.title,
              summary: candidate.summary,
              createdAt: candidate.createdAt,
              suggestedProject: candidate.suggestedProject,
              category: candidate.category,
              score,
            });
          }
        }

        const topMatches = scored.sort((a, b) => b.score - a.score).slice(0, 5);
        const duplicateSuggestion = buildDuplicateSuggestion(
          {
            suggestedProject: organized.suggestedProject || currentNoteHints?.suggestedProject || null,
            category: organized.category || currentNoteHints?.category || null,
          },
          scored,
          0.9
        );

        for (const match of topMatches) {
          const [sourceNoteId, targetNoteId] = [noteId, match.id].sort();

          await prisma.noteRelation.upsert({
            where: { sourceNoteId_targetNoteId: { sourceNoteId, targetNoteId } },
            update: { score: match.score, reason: "Embedding similarity" },
            create: { sourceNoteId, targetNoteId, score: match.score, reason: "Embedding similarity" },
          });
        }

        const nextAiMeta = { ...baseAiMeta } as Record<string, unknown>;
        if (duplicateSuggestion) {
          nextAiMeta.duplicateSuggestion = duplicateSuggestion as unknown;
        } else {
          delete nextAiMeta.duplicateSuggestion;
        }

        await prisma.note.update({
          where: { id: noteId },
          data: {
            aiMeta: nextAiMeta as Prisma.InputJsonValue,
          },
        });
      }
    } catch (relationError) {
      console.error("Error creating related-note links:", relationError);
    }

    try {
      await rescoreUserReclassificationQueue(userId);
    } catch (reclassificationError) {
      console.error("Error rescoring changed-meaning queue:", reclassificationError);
    }
  } catch (aiError) {
    console.error("Error organizing note:", aiError);

    await prisma.note.update({
      where: { id: noteId },
      data: {
        status: "PROCESSED",
        title: rawContent.split("\n")[0]?.slice(0, 80),
        summary: rawContent.slice(0, 200),
        confidenceScore: 0.2,
      },
    });
  }
}
