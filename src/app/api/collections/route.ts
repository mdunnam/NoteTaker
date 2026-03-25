/**
 * GET  /api/collections - list collections for the current user
 * POST /api/collections - create a collection
 */

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

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

    const { name, description, color, icon } = await request.json();

    const trimmedName = (name || "").trim();

    if (!trimmedName) {
      return NextResponse.json({ error: "Collection name is required" }, { status: 400 });
    }

    const collection = await prisma.collection.create({
      data: {
        userId: session.user.id,
        name: trimmedName,
        description: description?.trim() || null,
        color: color || "gray",
        icon: icon || null,
      },
      include: {
        _count: {
          select: { notes: true },
        },
      },
    });

    return NextResponse.json(collection, { status: 201 });
  } catch (error) {
    console.error("Error creating collection:", error);
    return NextResponse.json({ error: "Failed to create collection" }, { status: 500 });
  }
}
