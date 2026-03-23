/**
 * POST /api/notes - Create a new note
 * GET /api/notes - List notes for the current user
 */

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { cosineSimilarity, embedNote, organizeNote, splitNote } from "@/lib/ai";
import { NextRequest, NextResponse } from "next/server";

interface CreateNoteOptions {
  userId: string;
  rawContent: string;
  tags?: string[];
  collectionId?: string | null;
}

/**
 * Create a base note in UNPROCESSED state.
 */
async function createBaseNote(options: CreateNoteOptions) {
  return prisma.note.create({
    data: {
      userId: options.userId,
      rawContent: options.rawContent.trim(),
      tags: options.tags || [],
      collectionId: options.collectionId || null,
      status: "UNPROCESSED",
    },
  });
}

/**
 * Run AI enrichment and relation/entity linking for a note.
 */
async function enrichNote(options: {
  noteId: string;
  userId: string;
  rawContent: string;
  fallbackTags?: string[];
}) {
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

      if (!normalizedName) {
        continue;
      }

      const entity = await prisma.entity.upsert({
        where: {
          userId_type_name: {
            userId,
            type: extractedEntity.type,
            name: normalizedName,
          },
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
        where: {
          noteId_entityId: {
            noteId,
            entityId: entity.id,
          },
        },
        update: {
          mentionCount: {
            increment: 1,
          },
        },
        create: {
          noteId,
          entityId: entity.id,
          mentionCount: 1,
        },
      });
    }

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
          select: {
            id: true,
            title: true,
            summary: true,
            rawContent: true,
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 25,
        });

        const scored: Array<{ id: string; score: number }> = [];

        for (const candidate of candidates) {
          const candidateText = `${candidate.title || ""}\n${candidate.summary || candidate.rawContent}`.trim();
          const candidateEmbedding = await embedNote(candidateText);

          if (candidateEmbedding.length === 0) {
            continue;
          }

          const score = cosineSimilarity(sourceEmbedding, candidateEmbedding);

          if (score >= 0.78) {
            scored.push({ id: candidate.id, score });
          }
        }

        const topMatches = scored.sort((a, b) => b.score - a.score).slice(0, 5);

        for (const match of topMatches) {
          const [sourceNoteId, targetNoteId] = [noteId, match.id].sort();

          await prisma.noteRelation.upsert({
            where: {
              sourceNoteId_targetNoteId: {
                sourceNoteId,
                targetNoteId,
              },
            },
            update: {
              score: match.score,
              reason: "Embedding similarity",
            },
            create: {
              sourceNoteId,
              targetNoteId,
              score: match.score,
              reason: "Embedding similarity",
            },
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

export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { rawContent, tags, collectionId, autoSplit = true } = await request.json();

    if (!rawContent || !rawContent.trim()) {
      return NextResponse.json(
        { error: "Content is required" },
        { status: 400 }
      );
    }

    const createdNoteIds: string[] = [];

    if (autoSplit) {
      try {
        const split = await splitNote(rawContent);

        if (split.needsSplit && split.notes.length > 1) {
          const limited = split.notes.slice(0, 8);

          for (const splitItem of limited) {
            const created = await createBaseNote({
              userId: session.user.id,
              rawContent: splitItem.content,
              tags,
              collectionId,
            });

            createdNoteIds.push(created.id);

            await enrichNote({
              noteId: created.id,
              userId: session.user.id,
              rawContent: splitItem.content,
              fallbackTags: tags || [],
            });
          }

          const createdNotes = await prisma.note.findMany({
            where: {
              id: { in: createdNoteIds },
            },
            orderBy: {
              createdAt: "desc",
            },
            include: {
              collection: true,
              entities: {
                include: {
                  entity: true,
                },
              },
            },
          });

          return NextResponse.json(
            {
              split: true,
              count: createdNotes.length,
              notes: createdNotes,
            },
            { status: 201 }
          );
        }
      } catch (splitError) {
        console.error("Error splitting note dump:", splitError);
      }
    }

    const note = await createBaseNote({
      userId: session.user.id,
      rawContent,
      tags,
      collectionId,
    });

    await enrichNote({
      noteId: note.id,
      userId: session.user.id,
      rawContent,
      fallbackTags: tags || [],
    });

    const freshNote = await prisma.note.findUnique({
      where: { id: note.id },
      include: {
        collection: true,
        entities: {
          include: {
            entity: true,
          },
        },
      },
    });

    return NextResponse.json(
      {
        split: false,
        count: 1,
        note: freshNote,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating note:", error);
    return NextResponse.json(
      { error: "Failed to create note" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const archived = searchParams.get("archived") === "true";
    const collectionId = searchParams.get("collectionId");

    const notes = await prisma.note.findMany({
      where: {
        userId: session.user.id,
        isArchived: archived,
        ...(collectionId && { collectionId }),
      },
      orderBy: {
        createdAt: "desc",
      },
      include: {
        collection: true,
        entities: {
          include: {
            entity: true,
          },
        },
      },
    });

    return NextResponse.json(notes);
  } catch (error) {
    console.error("Error fetching notes:", error);
    return NextResponse.json(
      { error: "Failed to fetch notes" },
      { status: 500 }
    );
  }
}
