import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    collection: {
      findMany: vi.fn(),
    },
    note: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { POST } from "./route";

const mockedAuth = vi.mocked(auth);
const mockedNoteFindMany = vi.mocked(prisma.note.findMany);
const mockedTransaction = vi.mocked(prisma.$transaction);

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/collections", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/collections POST", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockedAuth.mockResolvedValue(null as never);

    const response = await POST(makeRequest({ name: "Alpha" }));

    expect(response.status).toBe(401);
  });

  it("returns 400 when name is missing", async () => {
    mockedAuth.mockResolvedValue({ user: { id: "u1" } } as never);

    const response = await POST(makeRequest({ name: "   " }));
    const payload = await response.json() as { error: string };

    expect(response.status).toBe(400);
    expect(payload.error).toContain("Collection name is required");
  });

  it("returns 400 when cluster note ids do not belong to the user", async () => {
    mockedAuth.mockResolvedValue({ user: { id: "u1" } } as never);
    mockedNoteFindMany.mockResolvedValue([{ id: "n1" }] as never);

    const response = await POST(makeRequest({
      name: "Alpha",
      noteIds: ["n1", "n2"],
    }));

    expect(response.status).toBe(400);
  });

  it("creates a collection and assigns provided notes in one transaction", async () => {
    mockedAuth.mockResolvedValue({ user: { id: "u1" } } as never);
    mockedNoteFindMany.mockResolvedValue([{ id: "n1" }, { id: "n2" }] as never);

    const txCollectionCreate = vi.fn().mockResolvedValue({ id: "c1" });
    const txNoteUpdateMany = vi.fn().mockResolvedValue({ count: 2 });
    const txCollectionFindUnique = vi.fn().mockResolvedValue({
      id: "c1",
      name: "Alpha",
      description: "Created from a cluster.",
      color: "blue",
      icon: null,
      _count: { notes: 2 },
    });

    (mockedTransaction as unknown as {
      mockImplementation: (callback: (tx: unknown) => Promise<unknown>) => void;
    }).mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({
      collection: {
        create: txCollectionCreate,
        findUnique: txCollectionFindUnique,
      },
      note: {
        updateMany: txNoteUpdateMany,
      },
    }));

    const response = await POST(makeRequest({
      name: "Alpha",
      description: "Created from a cluster.",
      color: "blue",
      noteIds: ["n1", "n2", "n2"],
    }));
    const payload = await response.json() as { id: string; _count: { notes: number } };

    expect(response.status).toBe(201);
    expect(payload.id).toBe("c1");
    expect(payload._count.notes).toBe(2);
    expect(txCollectionCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ name: "Alpha", userId: "u1" }),
    }));
    expect(txNoteUpdateMany).toHaveBeenCalledWith({
      where: {
        userId: "u1",
        id: { in: ["n1", "n2"] },
      },
      data: {
        collectionId: "c1",
      },
    });
  });
});