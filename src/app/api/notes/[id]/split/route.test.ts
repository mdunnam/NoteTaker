import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/ai", () => ({
  splitNote: vi.fn(),
}));

vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    note: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { auth } from "@/auth";
import { splitNote } from "@/lib/ai";
import { prisma } from "@/lib/db";
import { checkRateLimit } from "@/lib/rateLimit";
import { POST } from "./route";

const mockedAuth = vi.mocked(auth);
const mockedSplitNote = vi.mocked(splitNote);
const mockedFindFirst = vi.mocked(prisma.note.findFirst);
const mockedTransaction = vi.mocked(prisma.$transaction);
const mockedCheckRateLimit = vi.mocked(checkRateLimit);

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/notes/n1/split", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/notes/[id]/split POST", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedCheckRateLimit.mockReturnValue({ ok: true });
  });

  it("returns 401 when not authenticated", async () => {
    mockedAuth.mockResolvedValue(null as never);

    const response = await POST(makeRequest({ mode: "preview" }), {
      params: { id: "n1" },
    });

    expect(response.status).toBe(401);
  });

  it("returns preview split candidates for a note", async () => {
    mockedAuth.mockResolvedValue({ user: { id: "u1" } } as never);
    mockedFindFirst.mockResolvedValue({
      id: "n1",
      userId: "u1",
      rawContent: "Call Jim. Buy milk.",
      tags: ["inbox"],
      collectionId: null,
    } as never);
    mockedSplitNote.mockResolvedValue({
      needsSplit: true,
      notes: [
        { content: "Call Jim", title: "Call Jim", category: "Work", type: "TASK" },
        { content: "Buy milk", title: "Buy milk", category: "Personal", type: "TASK" },
      ],
    } as never);

    const response = await POST(makeRequest({ mode: "preview" }), {
      params: { id: "n1" },
    });
    const payload = (await response.json()) as { needsSplit: boolean; notes: Array<{ content: string }> };

    expect(response.status).toBe(200);
    expect(payload.needsSplit).toBe(true);
    expect(payload.notes.length).toBe(2);
  });

  it("creates selected split notes", async () => {
    mockedAuth.mockResolvedValue({ user: { id: "u1" } } as never);
    mockedFindFirst.mockResolvedValue({
      id: "n1",
      userId: "u1",
      rawContent: "Call Jim. Buy milk.",
      tags: ["inbox"],
      collectionId: null,
    } as never);

    const txNoteCreate = vi
      .fn()
      .mockResolvedValueOnce({ id: "split1" })
      .mockResolvedValueOnce({ id: "split2" });
    const txNoteJobCreate = vi.fn().mockResolvedValue({ id: "job1" });

    (mockedTransaction as unknown as { mockImplementation: (fn: (callback: unknown) => Promise<unknown>) => void })
      .mockImplementation(async (callback: unknown) => (callback as (tx: unknown) => Promise<unknown>)({
        note: { create: txNoteCreate },
        noteJob: { create: txNoteJobCreate },
      }));

    const response = await POST(
      makeRequest({
        mode: "create",
        selectedNotes: [
          { content: "Call Jim", title: "Call Jim", category: "Work", type: "TASK" },
          { content: "Buy milk", title: "Buy milk", category: "Personal", type: "TASK" },
        ],
      }),
      { params: { id: "n1" } }
    );

    const payload = (await response.json()) as { count: number; createdNoteIds: string[] };

    expect(response.status).toBe(201);
    expect(payload.count).toBe(2);
    expect(payload.createdNoteIds).toEqual(["split1", "split2"]);
    expect(txNoteCreate).toHaveBeenCalledTimes(2);
    expect(txNoteJobCreate).toHaveBeenCalledTimes(2);
  });
});
