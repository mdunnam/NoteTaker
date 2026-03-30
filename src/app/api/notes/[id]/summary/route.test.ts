import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/ai", () => ({
  organizeNote: vi.fn(),
}));

vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    note: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { auth } from "@/auth";
import { organizeNote } from "@/lib/ai";
import { prisma } from "@/lib/db";
import { checkRateLimit } from "@/lib/rateLimit";
import { POST } from "./route";

const mockedAuth = vi.mocked(auth);
const mockedOrganizeNote = vi.mocked(organizeNote);
const mockedFindFirst = vi.mocked(prisma.note.findFirst);
const mockedUpdate = vi.mocked(prisma.note.update);
const mockedCheckRateLimit = vi.mocked(checkRateLimit);

function makeRequest() {
  return new NextRequest("http://localhost/api/notes/n1/summary", {
    method: "POST",
  });
}

describe("/api/notes/[id]/summary POST", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedCheckRateLimit.mockReturnValue({ ok: true });
  });

  it("returns 401 when not authenticated", async () => {
    mockedAuth.mockResolvedValue(null as never);

    const response = await POST(makeRequest(), { params: { id: "n1" } });

    expect(response.status).toBe(401);
  });

  it("returns 429 when rate limit exceeded", async () => {
    mockedAuth.mockResolvedValue({ user: { id: "u1" } } as never);
    mockedCheckRateLimit.mockReturnValue({ ok: false, retryAfter: 10 });

    const response = await POST(makeRequest(), { params: { id: "n1" } });

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("10");
  });

  it("regenerates and persists summary", async () => {
    mockedAuth.mockResolvedValue({ user: { id: "u1" } } as never);
    mockedFindFirst.mockResolvedValue({ id: "n1", rawContent: "Call Jim about invoices" } as never);
    mockedOrganizeNote.mockResolvedValue({
      title: "Call Jim",
      summary: "A follow-up note focused on invoice reconciliation and next outreach.",
      category: "Work",
      type: "TASK",
      tags: ["finance"],
      suggestedProject: undefined,
      extractedTasks: [{ text: "Call Jim about invoice discrepancies" }],
      extractedDates: [],
      extractedEntities: [{ type: "PERSON", name: "Jim" }],
      confidenceScore: 0.82,
    } as never);
    mockedUpdate.mockResolvedValue({
      id: "n1",
      summary: "A follow-up note focused on invoice reconciliation and next outreach.",
      confidenceScore: 0.82,
      updatedAt: new Date("2026-03-30T00:00:00.000Z"),
    } as never);

    const response = await POST(makeRequest(), { params: { id: "n1" } });
    const payload = (await response.json()) as { id: string; summary: string };

    expect(response.status).toBe(200);
    expect(payload.id).toBe("n1");
    expect(mockedOrganizeNote).toHaveBeenCalledWith("Call Jim about invoices");
    expect(mockedUpdate).toHaveBeenCalled();
  });
});
