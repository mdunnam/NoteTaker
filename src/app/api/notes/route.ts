/**
 * POST /api/notes - Create a new note
 * GET /api/notes - List notes for the current user
 */

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { organizeNote } from "@/lib/ai";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { rawContent, tags, collectionId } = await request.json();

    if (!rawContent || !rawContent.trim()) {
      return NextResponse.json(
        { error: "Content is required" },
        { status: 400 }
      );
    }

    // Create note in UNPROCESSED state
    const note = await prisma.note.create({
      data: {
        userId: session.user.id,
        rawContent: rawContent.trim(),
        tags: tags || [],
        collectionId: collectionId || null,
        status: "UNPROCESSED",
      },
    });

    // Trigger AI organization synchronously for now.
    try {
      const organized = await organizeNote(rawContent);

      // Update note with AI output
      await prisma.note.update({
        where: { id: note.id },
        data: {
          title: organized.title,
          summary: organized.summary,
          category: organized.category,
          type: organized.type,
          tags: organized.tags.length > 0 ? organized.tags : tags || [],
          suggestedProject: organized.suggestedProject || null,
          extractedTasks: organized.extractedTasks || null,
          extractedDates: organized.extractedDates || null,
          extractedEntities: organized.extractedEntities || null,
          confidenceScore: organized.confidenceScore,
          status: "PROCESSED",
        },
      });

      const extractedEntities = organized.extractedEntities || [];

      if (extractedEntities.length > 0) {
        for (const extractedEntity of extractedEntities) {
          const normalizedName = extractedEntity.name.trim();

          if (!normalizedName) {
            continue;
          }

          const entity = await prisma.entity.upsert({
            where: {
              userId_type_name: {
                userId: session.user.id,
                type: extractedEntity.type,
                name: normalizedName,
              },
            },
            update: {},
            create: {
              userId: session.user.id,
              type: extractedEntity.type,
              name: normalizedName,
              permalink: normalizedName.toLowerCase().replace(/\s+/g, "-"),
            },
          });

          await prisma.noteEntity.upsert({
            where: {
              noteId_entityId: {
                noteId: note.id,
                entityId: entity.id,
              },
            },
            update: {
              mentionCount: {
                increment: 1,
              },
            },
            create: {
              noteId: note.id,
              entityId: entity.id,
              mentionCount: 1,
            },
          });
        }
      }
    } catch (aiError) {
      console.error("Error organizing note:", aiError);

      // Mark as processed so the note still appears as handled when AI enrichment fails.
      await prisma.note.update({
        where: { id: note.id },
        data: {
          status: "PROCESSED",
          title: note.rawContent.split("\n")[0]?.slice(0, 80) || note.title,
          summary: note.rawContent.slice(0, 200),
          confidenceScore: 0.2,
        },
      });
    }

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

    return NextResponse.json(freshNote, { status: 201 });
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
