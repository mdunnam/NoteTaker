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

    // Trigger AI organization in the background
    // For now, we'll do it synchronously, but this could be moved to a queue
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

      // TODO: Create/link entities
      // TODO: Generate embedding for semantic search
    } catch (aiError) {
      console.error("Error organizing note:", aiError);
      // Note stays in PROCESSED state even if AI fails
      // User can manually organize if needed
    }

    return NextResponse.json(note, { status: 201 });
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
