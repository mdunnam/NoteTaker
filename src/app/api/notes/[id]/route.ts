/**
 * GET    /api/notes/[id] - Retrieve a single note
 * PATCH  /api/notes/[id] - Update a note
 * DELETE /api/notes/[id] - Delete a note
 */

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

interface Params {
  params: {
    id: string;
  };
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const note = await prisma.note.findFirst({
      where: { id: params.id, userId: session.user.id },
      include: {
        collection: true,
        entities: {
          include: { entity: true },
        },
        relatedNotesFrom: {
          include: {
            targetNote: {
              select: { id: true, title: true, summary: true, createdAt: true },
            },
          },
          orderBy: { score: "desc" },
          take: 5,
        },
        relatedNotesTo: {
          include: {
            sourceNote: {
              select: { id: true, title: true, summary: true, createdAt: true },
            },
          },
          orderBy: { score: "desc" },
          take: 5,
        },
      },
    });

    if (!note) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    return NextResponse.json(note);
  } catch (error) {
    console.error("Error fetching note:", error);
    return NextResponse.json({ error: "Failed to fetch note" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = params;
    const body = await request.json();

    // Verify ownership
    const note = await prisma.note.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (!note) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    // Update only allowed fields
    const updatedNote = await prisma.note.update({
      where: { id },
      data: {
        ...(body.title !== undefined && { title: body.title }),
        ...(body.rawContent !== undefined && { rawContent: body.rawContent }),
        ...(body.summary !== undefined && { summary: body.summary }),
        ...(body.category !== undefined && { category: body.category }),
        ...(body.type !== undefined && { type: body.type }),
        ...(body.priority !== undefined && { priority: body.priority }),
        ...(body.tags !== undefined && { tags: body.tags }),
        ...(body.suggestedProject !== undefined && { suggestedProject: body.suggestedProject }),
        ...(body.aiMeta !== undefined && { aiMeta: body.aiMeta }),
        ...(body.isArchived !== undefined && { isArchived: body.isArchived }),
        ...(body.isPinned !== undefined && { isPinned: body.isPinned }),
        ...(body.collectionId !== undefined && { collectionId: body.collectionId }),
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

    return NextResponse.json(updatedNote);
  } catch (error) {
    console.error("Error updating note:", error);
    return NextResponse.json(
      { error: "Failed to update note" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = params;

    // Verify ownership
    const note = await prisma.note.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (!note) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    await prisma.note.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting note:", error);
    return NextResponse.json(
      { error: "Failed to delete note" },
      { status: 500 }
    );
  }
}
