import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/ai", () => ({
  synthesizeNotes: vi.fn(),
}));

vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    note: {
      findMany: vi.fn(),
    },
  },
}));

import { auth } from "@/auth";
import { synthesizeNotes } from "@/lib/ai";
import { prisma } from "@/lib/db";
import { checkRateLimit } from "@/lib/rateLimit";
import { POST } from "./route";

const mockedAuth = vi.mocked(auth);
const mockedSynthesizeNotes = vi.mocked(synthesizeNotes);
const mockedFindMany = vi.mocked(prisma.note.findMany);
const mockedCheckRateLimit = vi.mocked(checkRateLimit);

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/synthesis", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/synthesis POST", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedCheckRateLimit.mockReturnValue({ ok: true });
  });

  it("returns 401 when not authenticated", async () => {
    mockedAuth.mockResolvedValue(null as never);

    const response = await POST(makeRequest({ noteIds: ["n1", "n2"] }));

    expect(response.status).toBe(401);
  });

  it("returns 400 for invalid payloads", async () => {
    mockedAuth.mockResolvedValue({ user: { id: "u1" } } as never);

    const response = await POST(makeRequest({ noteIds: ["n1"] }));

    expect(response.status).toBe(400);
  });

  it("returns 400 when fewer than two valid notes are loaded", async () => {
    mockedAuth.mockResolvedValue({ user: { id: "u1" } } as never);
    mockedFindMany.mockResolvedValue([{ id: "n1" }] as never);

    const response = await POST(makeRequest({ noteIds: ["n1", "n2"] }));

    expect(response.status).toBe(400);
  });

  it("synthesizes the selected notes", async () => {
    mockedAuth.mockResolvedValue({ user: { id: "u1" } } as never);
    mockedFindMany.mockResolvedValue([
      {
        id: "n1",
        title: "Launch blockers",
        summary: "Summarized launch blockers",
        rawContent: "Launch blockers raw",
        category: "Work",
        suggestedProject: "QNote",
        createdAt: new Date("2026-04-01T00:00:00.000Z"),
      },
      {
        id: "n2",
        title: "Launch follow-up",
        summary: "Summarized follow-up",
        rawContent: "Follow-up raw",
        category: "Work",
        suggestedProject: "QNote",
        createdAt: new Date("2026-04-02T00:00:00.000Z"),
      },
    ] as never);
    mockedSynthesizeNotes.mockResolvedValue({
      title: "Launch synthesis",
      summary: "Combined launch view.",
      themes: ["launch"],
      actions: ["Resolve blockers"],
      openQuestions: ["Who owns approval?"],
      dominantProject: "QNote",
      dominantCategory: "Work",
      plan: {
        objective: "Ship the launch plan.",
        firstMove: "Resolve the top blocker.",
        steps: [
          { title: "Resolve blocker", detail: "Unblock the launch.", horizon: "now" },
          { title: "Sequence follow-up", detail: "Order the remaining work.", horizon: "next" },
        ],
        risks: ["Approval is still unclear."],
        successSignal: "The launch has a clear next step and owner.",
      },
      noteCount: 2,
      sourceNoteIds: ["n1", "n2"],
    });

    const response = await POST(makeRequest({ noteIds: ["n1", "n2"], planningGoal: "Ship this week" }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.title).toBe("Launch synthesis");
    expect(payload.plan.objective).toBe("Ship the launch plan.");
    expect(mockedSynthesizeNotes).toHaveBeenCalledWith([
      expect.objectContaining({ id: "n1" }),
      expect.objectContaining({ id: "n2" }),
    ], {
      planningGoal: "Ship this week",
    });
  });
});