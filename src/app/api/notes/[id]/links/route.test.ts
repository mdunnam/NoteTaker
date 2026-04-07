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
    noteRelation: {
      upsert: vi.fn(),
    },
  },
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { POST } from "./route";

const mockedAuth = vi.mocked(auth);
const mockedNoteFindMany = vi.mocked(prisma.note.findMany);
const mockedRelationUpsert = vi.mocked(prisma.noteRelation.upsert);

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/notes/n1/links", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/notes/[id]/links POST", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockedAuth.mockResolvedValue(null as never);

    const response = await POST(makeRequest({ targetNoteId: "n2" }), {
      params: { id: "n1" },
    });

    expect(response.status).toBe(401);
  });

  it("returns 400 when trying to link a note to itself", async () => {
    mockedAuth.mockResolvedValue({ user: { id: "u1" } } as never);

    const response = await POST(makeRequest({ targetNoteId: "n1" }), {
      params: { id: "n1" },
    });

    expect(response.status).toBe(400);
  });

  it("returns 404 when one of the notes is missing", async () => {
    mockedAuth.mockResolvedValue({ user: { id: "u1" } } as never);
    mockedNoteFindMany.mockResolvedValue([{ id: "n1" }] as never);

    const response = await POST(makeRequest({ targetNoteId: "n2" }), {
      params: { id: "n1" },
    });

    expect(response.status).toBe(404);
  });

  it("creates or updates a stable note relation", async () => {
    mockedAuth.mockResolvedValue({ user: { id: "u1" } } as never);
    mockedNoteFindMany.mockResolvedValue([{ id: "n1" }, { id: "n2" }] as never);
    mockedRelationUpsert.mockResolvedValue({
      id: "r1",
      sourceNoteId: "n1",
      targetNoteId: "n2",
      score: 0.91,
      reason: "Accepted from suggested links",
    } as never);

    const response = await POST(makeRequest({ targetNoteId: "n2", score: 0.91 }), {
      params: { id: "n1" },
    });
    const payload = await response.json() as { id: string; sourceNoteId: string; targetNoteId: string };

    expect(response.status).toBe(201);
    expect(payload.id).toBe("r1");
    expect(mockedRelationUpsert).toHaveBeenCalledWith({
      where: {
        sourceNoteId_targetNoteId: {
          sourceNoteId: "n1",
          targetNoteId: "n2",
        },
      },
      update: {
        reason: "Accepted from suggested links",
        score: 0.91,
      },
      create: {
        sourceNoteId: "n1",
        targetNoteId: "n2",
        reason: "Accepted from suggested links",
        score: 0.91,
      },
    });
  });
});