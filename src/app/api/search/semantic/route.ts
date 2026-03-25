/**
 * POST /api/search/semantic - semantic similarity search over note embeddings
 */

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { embedNote, cosineSimilarity } from "@/lib/ai";
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rateLimit";

interface SemanticSearchRequest {
  query: string;
  limit?: number;
}

/**
 * Semantic search using note embeddings and cosine similarity.
 * Falls back to keyword search if embeddings not available.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Rate limit check
    const rateLimitResult = checkRateLimit(session.user.id, "/api/search/semantic");
    if (!rateLimitResult.ok) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again in a moment." },
        { status: 429, headers: { "Retry-After": String(rateLimitResult.retryAfter) } }
      );
    }

    const body = (await request.json()) as SemanticSearchRequest;
    const query = (body.query || "").trim();
    const limit = Math.min(body.limit || 20, 50);

    if (!query) {
      return NextResponse.json({ error: "Query is required" }, { status: 400 });
    }

    // Get active processed notes to score semantically.
    const notes = await prisma.note.findMany({
      where: {
        userId: session.user.id,
        isArchived: false,
        status: "PROCESSED",
      },
      select: {
        id: true,
        title: true,
        summary: true,
        rawContent: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 100, // Search pool
    });

    // Embed the search query
    let queryEmbedding: number[] = [];
    try {
      queryEmbedding = await embedNote(query);
    } catch (error) {
      console.error("Error embedding query:", error);
      // Fall back to keyword search if embedding fails
      return performKeywordSearch(notes, query, limit);
    }

    if (queryEmbedding.length === 0) {
      return performKeywordSearch(notes, query, limit);
    }

    const scored: Array<{
      id: string;
      title: string | null;
      summary: string | null;
      rawContent: string;
      createdAt: Date;
      score: number;
    }> = [];

    for (const note of notes) {
      const candidateText = `${note.title || ""}\n${note.summary || note.rawContent}`.trim();
      const candidateEmbedding = await embedNote(candidateText);

      if (candidateEmbedding.length === 0) {
        continue;
      }

      const score = cosineSimilarity(queryEmbedding, candidateEmbedding);
      if (score > 0.5) {
        scored.push({ ...note, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);

    return NextResponse.json({
      results: scored.slice(0, limit).map((note) => ({
        id: note.id,
        title: note.title,
        summary: note.summary,
        rawContent: note.rawContent,
        createdAt: note.createdAt,
        score: Math.round(note.score * 100),
      })),
      method: "semantic",
    });
  } catch (error) {
    console.error("Error in semantic search:", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}

/**
 * Fallback keyword-based search when embeddings unavailable.
 */
function performKeywordSearch(
  notes: Array<{ id: string; title: string | null; summary: string | null; rawContent: string; createdAt: Date }>,
  query: string,
  limit: number
) {
  const queryLower = query.toLowerCase();
  const scored = notes
    .map((note) => {
      let score = 0;
      if (note.title?.toLowerCase().includes(queryLower)) score += 3;
      if (note.summary?.toLowerCase().includes(queryLower)) score += 2;
      if (note.rawContent.toLowerCase().includes(queryLower)) score += 1;
      return { ...note, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return NextResponse.json({
    results: scored.map((note) => ({
      id: note.id,
      title: note.title,
      summary: note.summary,
      rawContent: note.rawContent,
      createdAt: note.createdAt,
      score: note.score,
    })),
    method: "keyword",
  });
}
