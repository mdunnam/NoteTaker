import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: vi.fn(),
  },
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { checkRateLimit } from "@/lib/rateLimit";
import { POST } from "./route";

const mockedAuth = vi.mocked(auth);
const mockedTransaction = vi.mocked(prisma.$transaction);
const mockedCheckRateLimit = vi.mocked(checkRateLimit);

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/notes/analyze-dump/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/notes/analyze-dump/confirm POST", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedCheckRateLimit.mockReturnValue({ ok: true });
  });

  it("returns 401 when not authenticated", async () => {
    mockedAuth.mockResolvedValue(null as never);

    const response = await POST(makeRequest({ splits: [] }));

    expect(response.status).toBe(401);
  });

  it("creates selected dump notes", async () => {
    mockedAuth.mockResolvedValue({ user: { id: "u1" } } as never);

    const txNoteCreate = vi
      .fn()
      .mockResolvedValueOnce({ id: "n1" })
      .mockResolvedValueOnce({ id: "n2" });
    const txJobCreate = vi.fn().mockResolvedValue({ id: "j1" });

    (mockedTransaction as unknown as { mockImplementation: (fn: (tx: unknown) => Promise<unknown>) => void })
      .mockImplementation(async (callback: unknown) => (callback as (tx: unknown) => Promise<unknown>)({
        note: { create: txNoteCreate },
        noteJob: { create: txJobCreate },
      }));

    const response = await POST(
      makeRequest({
        splits: [
          {
            rawContent: "Call Jim",
            title: "Call Jim",
            summary: "Follow-up",
            category: "Work",
            type: "TASK",
            priority: "high",
            tags: ["finance"],
            extractedTasks: [{ text: "Call Jim", priority: "high" }],
          },
          {
            rawContent: "Buy milk",
            title: "Buy milk",
            summary: "Errand",
            category: "Personal",
            type: "TASK",
            priority: "medium",
            tags: ["home"],
            extractedTasks: [{ text: "Buy milk", priority: "medium" }],
          },
        ],
      })
    );

    const payload = (await response.json()) as { count: number; createdNoteIds: string[] };

    expect(response.status).toBe(201);
    expect(payload.count).toBe(2);
    expect(payload.createdNoteIds).toEqual(["n1", "n2"]);
    expect(txNoteCreate).toHaveBeenCalledTimes(2);
    expect(txJobCreate).toHaveBeenCalledTimes(2);
  });
});
