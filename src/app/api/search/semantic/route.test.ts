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
      },
      {
        id: "n2",
        title: "Shopping",
        summary: "Groceries",
        rawContent: "Milk and eggs",
        createdAt: new Date("2026-01-02"),
      },
    ] as never);

    mockedEmbedNote
      .mockResolvedValueOnce([1, 0])
      .mockResolvedValueOnce([1, 0])
      .mockResolvedValueOnce([0, 1]);

    mockedCosineSimilarity
      .mockReturnValueOnce(0.92)
      .mockReturnValueOnce(0.22);

    const response = await POST(makeRequest({ query: "roadmap", limit: 10 }));
    const payload = (await response.json()) as { method: string; results: Array<{ id: string }> };

    expect(response.status).toBe(200);
    expect(payload.method).toBe("semantic");
    expect(payload.results[0]?.id).toBe("n1");
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
      },
    ] as never);

    mockedEmbedNote.mockRejectedValueOnce(new Error("embedding unavailable"));

    const response = await POST(makeRequest({ query: "roadmap", limit: 10 }));
    const payload = (await response.json()) as { method: string; results: Array<{ id: string }> };

    expect(response.status).toBe(200);
    expect(payload.method).toBe("keyword");
    expect(payload.results[0]?.id).toBe("n1");
  });
});
