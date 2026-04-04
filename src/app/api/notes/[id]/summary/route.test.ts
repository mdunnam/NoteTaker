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

vi.mock("@/lib/clusters", () => ({
  rescoreUserReclassificationQueue: vi.fn(),
}));

vi.mock("@/lib/userMemory", () => ({
  getThinkingMemory: vi.fn(),
  buildThinkingMemoryPrompt: vi.fn(),
  updateThinkingMemory: vi.fn(),
  recordHintUsage: vi.fn(),
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
import { rescoreUserReclassificationQueue } from "@/lib/clusters";
import { prisma } from "@/lib/db";
import { checkRateLimit } from "@/lib/rateLimit";
import { buildThinkingMemoryPrompt, getThinkingMemory, updateThinkingMemory, recordHintUsage } from "@/lib/userMemory";
import { POST } from "./route";

const mockedAuth = vi.mocked(auth);
const mockedOrganizeNote = vi.mocked(organizeNote);
const mockedFindFirst = vi.mocked(prisma.note.findFirst);
const mockedUpdate = vi.mocked(prisma.note.update);
const mockedCheckRateLimit = vi.mocked(checkRateLimit);
const mockedGetThinkingMemory = vi.mocked(getThinkingMemory);
const mockedBuildThinkingMemoryPrompt = vi.mocked(buildThinkingMemoryPrompt);
const mockedUpdateThinkingMemory = vi.mocked(updateThinkingMemory);
const mockedRecordHintUsage = vi.mocked(recordHintUsage);
const mockedRescoreUserReclassificationQueue = vi.mocked(rescoreUserReclassificationQueue);

function makeRequest() {
  return new NextRequest("http://localhost/api/notes/n1/summary", {
    method: "POST",
  });
}

function makeRequestWithHints(body: unknown) {
  return new NextRequest("http://localhost/api/notes/n1/summary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/notes/[id]/summary POST", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedCheckRateLimit.mockReturnValue({ ok: true });
    mockedGetThinkingMemory.mockResolvedValue({
      knownProjects: [],
      knownContexts: [],
      knownPeople: [],
      knownTopics: [],
      hintStats: [],
      reviewState: {
        forgottenNotes: [],
        patterns: [],
        reclassifications: [],
      },
      reviewActionStats: [],
    });
    mockedBuildThinkingMemoryPrompt.mockReturnValue("Known projects: (none)");
    mockedUpdateThinkingMemory.mockResolvedValue(undefined);
    mockedRecordHintUsage.mockResolvedValue(undefined);
    mockedRescoreUserReclassificationQueue.mockResolvedValue(undefined);
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
    mockedFindFirst.mockResolvedValue({
      id: "n1",
      rawContent: "Call Jim about invoices",
      suggestedProject: null,
      category: null,
    } as never);
    mockedOrganizeNote.mockResolvedValue({
      title: "Call Jim",
      summary: "A follow-up note focused on invoice reconciliation and next outreach.",
      intent: "Resolve invoice mismatch with Jim.",
      nextAction: "Call Jim to confirm invoice details",
      priority: "high",
      category: "Work",
      type: "TASK",
      tags: ["finance"],
      suggestedProject: undefined,
      extractedTasks: [{ text: "Call Jim about invoice discrepancies", priority: "high" }],
      extractedDates: [],
      extractedEntities: [{ type: "PERSON", name: "Jim" }],
      clarificationQuestions: [],
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
    expect(mockedOrganizeNote).toHaveBeenCalledWith(
      "Call Jim about invoices",
      expect.objectContaining({ userContext: "Known projects: (none)" })
    );
    expect(mockedUpdate).toHaveBeenCalled();
    expect(mockedRescoreUserReclassificationQueue).toHaveBeenCalledWith("u1");
  });

  it("uses project/context hints when provided", async () => {
    mockedAuth.mockResolvedValue({ user: { id: "u1" } } as never);
    mockedFindFirst.mockResolvedValue({
      id: "n1",
      rawContent: "Discuss Q2 launch blockers",
      suggestedProject: null,
      category: null,
      aiMeta: {
        clarificationQuestions: ["Which project is this for?", "What context is this in?"],
        clarificationHistory: [],
      },
    } as never);
    mockedOrganizeNote.mockResolvedValue({
      title: "Q2 blockers",
      summary: "Focused note about launch blockers and immediate owner follow-up.",
      category: "Sprint planning",
      type: "TASK",
      tags: ["q2"],
      suggestedProject: "Project A",
      extractedTasks: [{ text: "Identify blocker owners" }],
      extractedDates: [],
      extractedEntities: [],
      confidenceScore: 0.9,
    } as never);
    mockedUpdate.mockResolvedValue({
      id: "n1",
      summary: "Focused note about launch blockers and immediate owner follow-up.",
      confidenceScore: 0.9,
      updatedAt: new Date("2026-03-30T00:00:00.000Z"),
    } as never);

    const response = await POST(
      makeRequestWithHints({ projectHint: "Project A", contextHint: "Sprint planning" }),
      { params: { id: "n1" } }
    );

    expect(response.status).toBe(200);
    expect(mockedOrganizeNote).toHaveBeenCalledWith(
      "Discuss Q2 launch blockers",
      expect.objectContaining({
        explicitProject: "Project A",
        explicitContext: "Sprint planning",
        clarificationContext: expect.stringContaining("Project A"),
      })
    );
    expect(mockedUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          aiMeta: expect.objectContaining({
            clarificationHistory: expect.arrayContaining([
              expect.objectContaining({ answer: "Project A", kind: "project" }),
              expect.objectContaining({ answer: "Sprint planning", kind: "context" }),
            ]),
          }),
        }),
      })
    );
  });
});
