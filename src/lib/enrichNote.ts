/**
 * AI enrichment pipeline for a single note.
 * Shared between the legacy fire-and-forget path and the durable job queue.
 */

import { prisma } from "@/lib/db";
import { cosineSimilarity, embedNote, organizeNote } from "@/lib/ai";

export interface EnrichNoteOptions {
  noteId: string;
  userId: string;
  rawContent: string;
  fallbackTags?: string[];
}

/**
 * Run AI enrichment, entity linking, and relation scoring for a note.
 * Marks the note PROCESSED on success or applies a minimal fallback on failure.
 */
export async function enrichNote(options: EnrichNoteOptions): Promise<void> {
  const { noteId, userId, rawContent, fallbackTags } = options;

  try {
    const organized = await organizeNote(rawContent);

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

    // Build similarity relations using on-the-fly embeddings
    try {
      const sourceText = `${organized.title || ""}\n${organized.summary || rawContent}`.trim();
      const sourceEmbedding = await embedNote(sourceText);

      if (sourceEmbedding.length > 0) {
        const candidates = await prisma.note.findMany({
          where: {
            userId,
            id: { not: noteId },
            isArchived: false,
            status: "PROCESSED",
          },
          select: { id: true, title: true, summary: true, rawContent: true },
          orderBy: { createdAt: "desc" },
          take: 25,
        });

        const scored: Array<{ id: string; score: number }> = [];

        for (const candidate of candidates) {
          const candidateText = `${candidate.title || ""}\n${candidate.summary || candidate.rawContent}`.trim();
          const candidateEmbedding = await embedNote(candidateText);
          if (candidateEmbedding.length === 0) continue;

          const score = cosineSimilarity(sourceEmbedding, candidateEmbedding);
          if (score >= 0.78) scored.push({ id: candidate.id, score });
        }

        const topMatches = scored.sort((a, b) => b.score - a.score).slice(0, 5);

        for (const match of topMatches) {
          const [sourceNoteId, targetNoteId] = [noteId, match.id].sort();

          await prisma.noteRelation.upsert({
            where: { sourceNoteId_targetNoteId: { sourceNoteId, targetNoteId } },
            update: { score: match.score, reason: "Embedding similarity" },
            create: { sourceNoteId, targetNoteId, score: match.score, reason: "Embedding similarity" },
          });
        }
      }
    } catch (relationError) {
      console.error("Error creating related-note links:", relationError);
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
