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
  return new NextRequest("http://localhost/api/search/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/search/ask POST", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedCheckRateLimit.mockReturnValue({ ok: true });
  });

  it("returns 400 when question is empty", async () => {
    mockedAuth.mockResolvedValue({ user: { id: "u1" } } as never);

    const response = await POST(makeRequest({ question: "   " }));

    expect(response.status).toBe(400);
  });

  it("returns 429 when rate limit exceeded", async () => {
    mockedAuth.mockResolvedValue({ user: { id: "u1" } } as never);
    mockedCheckRateLimit.mockReturnValue({ ok: false, retryAfter: 6 });

    const response = await POST(makeRequest({ question: "What should I do next?" }));

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("6");
  });

  it("returns fallback answer with sources when OpenAI is not configured", async () => {
    mockedAuth.mockResolvedValue({ user: { id: "u1" } } as never);
    mockedFindMany.mockResolvedValue([
      {
        id: "n1",
        title: "Launch checklist",
        summary: "Prepare release",
        rawContent: "Release prep",
        createdAt: new Date("2026-01-01"),
      },
    ] as never);

    mockedEmbedNote
      .mockResolvedValueOnce([1, 0])
      .mockResolvedValueOnce([1, 0]);
    mockedCosineSimilarity.mockReturnValue(0.91);

    const response = await POST(makeRequest({ question: "What is my launch status?" }));
    const payload = (await response.json()) as { answer: string; sources: Array<{ id: string }> };

    expect(response.status).toBe(200);
    expect(payload.answer).toContain("OpenAI is not configured");
    expect(payload.sources[0]?.id).toBe("n1");
  });

  it("returns empty-note answer when no notes exist", async () => {
    mockedAuth.mockResolvedValue({ user: { id: "u1" } } as never);
    mockedFindMany.mockResolvedValue([] as never);
    mockedEmbedNote.mockResolvedValue([]);

    const response = await POST(makeRequest({ question: "Anything new?" }));
    const payload = (await response.json()) as { answer: string; sources: unknown[] };

    expect(response.status).toBe(200);
    expect(payload.answer).toContain("No notes available");
    expect(payload.sources).toHaveLength(0);
  });
});
