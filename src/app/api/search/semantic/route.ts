/**
 * POST /api/search/semantic - semantic similarity search over note embeddings
 */

import { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { embedNote, cosineSimilarity } from "@/lib/ai";
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rateLimit";
import { parsePgVectorLiteral } from "@/lib/pgvector";
import {
  buildSearchSnippet,
  rankKeywordCandidates,
  scoreKeywordCandidate,
  selectTopSemanticCandidates,
} from "@/lib/searchRanking";
import { z } from "zod";

const SearchFiltersSchema = z.object({
  category: z.string().trim().max(120).optional(),
  type: z.string().trim().max(60).optional(),
  tag: z.string().trim().max(60).optional(),
  dateRange: z.enum(["all", "7d", "30d", "90d", "365d"]).optional().default("all"),
});

const SemanticSearchRequestSchema = z.object({
  query: z.string().trim().min(1).max(400),
  limit: z.number().int().min(1).max(50).optional().default(20),
  mode: z.enum(["semantic", "keyword"]).optional().default("semantic"),
  typeahead: z.boolean().optional().default(false),
  filters: SearchFiltersSchema.optional().default({}),
});

type SemanticSearchRequest = z.infer<typeof SemanticSearchRequestSchema>;

interface SearchNote {
  id: string;
  title: string | null;
  summary: string | null;
  rawContent: string;
  createdAt: Date;
  category?: string | null;
  type?: string | null;
  tags?: string[];
  suggestedProject?: string | null;
}

/** Build optional createdAt filter from a date-range token. */
function getCreatedAtFilter(dateRange?: SemanticSearchRequest["filters"]["dateRange"]) {
  const now = Date.now();

  if (dateRange === "7d") return { gte: new Date(now - 7 * 24 * 60 * 60 * 1000) };
  if (dateRange === "30d") return { gte: new Date(now - 30 * 24 * 60 * 60 * 1000) };
  if (dateRange === "90d") return { gte: new Date(now - 90 * 24 * 60 * 60 * 1000) };
  if (dateRange === "365d") return { gte: new Date(now - 365 * 24 * 60 * 60 * 1000) };

  return undefined;
}

/** Shape a note into the UI-facing search result payload. */
function buildSearchResult(note: SearchNote, score: number, query: string) {
  const { snippet, matchedTerms } = buildSearchSnippet(note, query);

  return {
    id: note.id,
    title: note.title,
    summary: note.summary,
    rawContent: note.rawContent,
    createdAt: note.createdAt,
    category: note.category ?? null,
    type: note.type ?? null,
    tags: note.tags ?? [],
    suggestedProject: note.suggestedProject ?? null,
    snippet,
    matchedTerms,
    score: Math.round(score),
  };
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

    const parsedBody = SemanticSearchRequestSchema.safeParse(await request.json());
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsedBody.error.flatten() },
        { status: 400 }
      );
    }

    const body = parsedBody.data;
    const query = body.query;
    const limit = body.typeahead ? Math.min(body.limit, 5) : body.limit;
    const createdAtFilter = getCreatedAtFilter(body.filters?.dateRange);

    // Get active processed notes to score semantically.
    const notes = await prisma.note.findMany({
      where: {
        userId: session.user.id,
        isArchived: false,
        status: "PROCESSED",
        ...(body.filters?.category ? { category: body.filters.category } : {}),
        ...(body.filters?.type ? { type: body.filters.type } : {}),
        ...(body.filters?.tag ? { tags: { has: body.filters.tag } } : {}),
        ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
      },
      select: {
        id: true,
        title: true,
        summary: true,
        rawContent: true,
        createdAt: true,
        category: true,
        type: true,
        tags: true,
        suggestedProject: true,
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    if (notes.length === 0) {
      return NextResponse.json({ results: [], method: body.mode }, { status: 200 });
    }

    if (body.mode === "keyword") {
      return performKeywordSearch(notes, query, limit);
    }

    const noteIds = notes.map((note) => note.id);
    const storedEmbeddings = noteIds.length === 0
      ? []
      : await prisma.$queryRaw<Array<{ id: string; embeddingText: string | null }>>(
          Prisma.sql`
            SELECT "id", "embedding"::text AS "embeddingText"
            FROM "Note"
            WHERE "id" IN (${Prisma.join(noteIds)})
          `
        );

    const embeddingById = new Map(
      storedEmbeddings.map((row) => [row.id, parsePgVectorLiteral(row.embeddingText)])
    );

    // Embed the search query
    let queryEmbedding: number[] = [];
    try {
      queryEmbedding = await embedNote(query);
    } catch (error) {
      console.error("Error embedding query:", error);
      return performKeywordSearch(notes, query, limit);
    }

    if (queryEmbedding.length === 0) {
      return performKeywordSearch(notes, query, limit);
    }

    const scored: Array<SearchNote & { score: number }> = [];

    for (const note of notes) {
      const storedEmbedding = embeddingById.get(note.id) || [];

      if (storedEmbedding.length === 0) {
        continue;
      }

      const semanticScore = cosineSimilarity(queryEmbedding, storedEmbedding);
      const keywordScore = scoreKeywordCandidate(note, query);
      const blendedScore = semanticScore * 0.85 + Math.min(keywordScore / 10, 1) * 0.15;

      if (blendedScore > 0.45) {
        scored.push({ ...note, score: blendedScore });
      }
    }

    if (scored.length === 0) {
      return performKeywordSearch(notes, query, limit);
    }

    const semanticResults = selectTopSemanticCandidates(scored, limit, 0.45);

    return NextResponse.json({
      results: semanticResults.map((note) => buildSearchResult(note, note.score * 100, query)),
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
  notes: SearchNote[],
  query: string,
  limit: number
) {
  const scored = rankKeywordCandidates(notes, query, limit);

  return NextResponse.json({
    results: scored.map((note) => buildSearchResult(note, note.score, query)),
    method: "keyword",
  });
}
