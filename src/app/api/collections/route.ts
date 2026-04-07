/**
 * GET  /api/collections - list collections for the current user
 * POST /api/collections - create a collection
 */

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const createCollectionSchema = z.object({
  name: z.string().trim().min(1, "Collection name is required"),
  description: z.string().trim().optional().nullable(),
  color: z.string().trim().optional().nullable(),
  icon: z.string().trim().optional().nullable(),
  noteIds: z.array(z.string().trim().min(1)).optional().default([]),
});

/** Deduplicate note ids while preserving the original request order. */
function getUniqueNoteIds(noteIds: string[]): string[] {
  return [...new Set(noteIds)];
}

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const collections = await prisma.collection.findMany({
      where: { userId: session.user.id },
      orderBy: { name: "asc" },
      include: {
        _count: {
          select: { notes: true },
        },
      },
    });

    return NextResponse.json(collections);
  } catch (error) {
    console.error("Error fetching collections:", error);
    return NextResponse.json({ error: "Failed to fetch collections" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = createCollectionSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid collection payload" },
        { status: 400 }
      );
    }

    const { name, description, color, icon } = parsed.data;
    const noteIds = getUniqueNoteIds(parsed.data.noteIds);

    if (noteIds.length > 0) {
      const accessibleNotes = await prisma.note.findMany({
        where: {
          userId: session.user.id,
          id: { in: noteIds },
        },
        select: { id: true },
      });

      if (accessibleNotes.length !== noteIds.length) {
        return NextResponse.json({ error: "One or more notes could not be added to this collection" }, { status: 400 });
      }
    }

    const collection = await prisma.$transaction(async (tx) => {
      const created = await tx.collection.create({
        data: {
          userId: session.user.id,
          name,
          description: description || null,
          color: color || "gray",
          icon: icon || null,
        },
      });

      if (noteIds.length > 0) {
        await tx.note.updateMany({
          where: {
            userId: session.user.id,
            id: { in: noteIds },
          },
          data: {
            collectionId: created.id,
          },
        });
      }

      return tx.collection.findUnique({
        where: { id: created.id },
        include: {
          _count: {
            select: { notes: true },
          },
        },
      });
    });

    if (!collection) {
      return NextResponse.json({ error: "Failed to create collection" }, { status: 500 });
    }

    return NextResponse.json(collection, { status: 201 });
  } catch (error) {
    console.error("Error creating collection:", error);
    return NextResponse.json({ error: "Failed to create collection" }, { status: 500 });
  }
}
