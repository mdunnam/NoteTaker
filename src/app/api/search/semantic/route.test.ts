import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    note: {
      findMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
}));

vi.mock("@/lib/ai", () => ({
  embedNote: vi.fn(),
  cosineSimilarity: vi.fn(),
}));

vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: vi.fn(),
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { embedNote, cosineSimilarity } from "@/lib/ai";
import { checkRateLimit } from "@/lib/rateLimit";
import { POST } from "./route";

const mockedAuth = vi.mocked(auth);
const mockedFindMany = vi.mocked(prisma.note.findMany);
const mockedQueryRaw = vi.mocked(prisma.$queryRaw);
const mockedEmbedNote = vi.mocked(embedNote);
const mockedCosineSimilarity = vi.mocked(cosineSimilarity);
const mockedCheckRateLimit = vi.mocked(checkRateLimit);

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/search/semantic", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/search/semantic POST", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedCheckRateLimit.mockReturnValue({ ok: true });
    mockedQueryRaw.mockResolvedValue([] as never);
  });

  it("returns 401 when not authenticated", async () => {
    mockedAuth.mockResolvedValue(null as never);

    const response = await POST(makeRequest({ query: "project roadmap" }));

    expect(response.status).toBe(401);
  });

  it("returns 429 when rate limit exceeded", async () => {
    mockedAuth.mockResolvedValue({ user: { id: "u1" } } as never);
    mockedCheckRateLimit.mockReturnValue({ ok: false, retryAfter: 12 });

    const response = await POST(makeRequest({ query: "project roadmap" }));

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("12");
  });

  it("returns semantic results when embeddings are available", async () => {
    mockedAuth.mockResolvedValue({ user: { id: "u1" } } as never);
    mockedFindMany.mockResolvedValue([
      {
        id: "n1",
        title: "Roadmap",
        summary: "Q2 planning",
        rawContent: "Build a roadmap",
        createdAt: new Date("2026-01-01"),
        category: "Work",
        type: "NOTE",
        tags: ["roadmap"],
        suggestedProject: "QNote",
      },
      {
        id: "n2",
        title: "Shopping",
        summary: "Groceries",
        rawContent: "Milk and eggs",
        createdAt: new Date("2026-01-02"),
        category: "Personal",
        type: "TASK",
        tags: ["home"],
        suggestedProject: null,
      },
    ] as never);

    mockedQueryRaw.mockResolvedValue([
      { id: "n1", embeddingText: "[1,0]" },
      { id: "n2", embeddingText: "[0,1]" },
    ] as never);

    mockedEmbedNote.mockResolvedValueOnce([1, 0]);

    mockedCosineSimilarity
      .mockReturnValueOnce(0.92)
      .mockReturnValueOnce(0.22);

    const response = await POST(makeRequest({ query: "roadmap", limit: 10 }));
    const payload = (await response.json()) as { method: string; results: Array<{ id: string; snippet: string }> };

    expect(response.status).toBe(200);
    expect(payload.method).toBe("semantic");
    expect(payload.results[0]?.id).toBe("n1");
    expect(payload.results[0]?.snippet).toBeTruthy();
  });

  it("falls back to keyword mode when query embedding fails", async () => {
    mockedAuth.mockResolvedValue({ user: { id: "u1" } } as never);
    mockedFindMany.mockResolvedValue([
      {
        id: "n1",
        title: "Roadmap",
        summary: null,
        rawContent: "Plan the launch roadmap",
        createdAt: new Date("2026-01-01"),
        category: "Work",
        type: "NOTE",
        tags: ["launch"],
        suggestedProject: null,
      },
    ] as never);

    mockedEmbedNote.mockRejectedValueOnce(new Error("embedding unavailable"));

    const response = await POST(makeRequest({ query: "roadmap", limit: 10 }));
    const payload = (await response.json()) as { method: string; results: Array<{ id: string }> };

    expect(response.status).toBe(200);
    expect(payload.method).toBe("keyword");
    expect(payload.results[0]?.id).toBe("n1");
  });

  it("supports explicit keyword mode with filters", async () => {
    mockedAuth.mockResolvedValue({ user: { id: "u1" } } as never);
    mockedFindMany.mockResolvedValue([
      {
        id: "n1",
        title: "Invoice cleanup",
        summary: "Finance follow-up",
        rawContent: "Review invoice backlog",
        createdAt: new Date("2026-01-03"),
        category: "Work",
        type: "TASK",
        tags: ["finance"],
        suggestedProject: "Ops",
      },
    ] as never);

    const response = await POST(makeRequest({
      query: "invoice",
      mode: "keyword",
      filters: {
        category: "Work",
        type: "TASK",
        tag: "finance",
        dateRange: "30d",
      },
    }));
    const payload = (await response.json()) as { method: string; results: Array<{ id: string }> };

    expect(response.status).toBe(200);
    expect(payload.method).toBe("keyword");
    expect(payload.results[0]?.id).toBe("n1");
    expect(mockedFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          category: "Work",
          type: "TASK",
          tags: { has: "finance" },
        }),
      })
    );
  });
});
