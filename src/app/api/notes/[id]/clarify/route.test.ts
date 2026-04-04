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
import { buildThinkingMemoryPrompt, getThinkingMemory, recordHintUsage, updateThinkingMemory } from "@/lib/userMemory";
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

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/notes/n1/clarify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/notes/[id]/clarify POST", () => {
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
      },
    });
    mockedBuildThinkingMemoryPrompt.mockReturnValue("Known projects: (none)");
    mockedUpdateThinkingMemory.mockResolvedValue(undefined);
    mockedRecordHintUsage.mockResolvedValue(undefined);
    mockedRescoreUserReclassificationQueue.mockResolvedValue(undefined);
  });

  it("returns 401 when not authenticated", async () => {
    mockedAuth.mockResolvedValue(null as never);

    const response = await POST(makeRequest({ answer: "This belongs to Couch Heroes." }), { params: { id: "n1" } });

    expect(response.status).toBe(401);
  });

  it("returns 400 when no clarification input is provided", async () => {
    mockedAuth.mockResolvedValue({ user: { id: "u1" } } as never);

    const response = await POST(makeRequest({}), { params: { id: "n1" } });

    expect(response.status).toBe(400);
  });

  it("persists a freeform clarification turn and regenerates the note", async () => {
    mockedAuth.mockResolvedValue({ user: { id: "u1" } } as never);
    mockedFindFirst.mockResolvedValue({
      id: "n1",
      rawContent: "Downtime direction notes",
      suggestedProject: null,
      category: null,
      confidenceScore: 0.42,
      aiMeta: {
        clarificationQuestions: ["Which project is this for?"],
        clarificationHistory: [],
      },
    } as never);
    mockedOrganizeNote.mockResolvedValue({
      title: "Couch Heroes downtime direction",
      summary: "Clarified art-direction note for Couch Heroes downtime styling.",
      intent: "Clarify the target visual direction for Couch Heroes downtime work.",
      nextAction: "Update the style guide with the clarified direction",
      priority: "medium",
      category: "Work",
      type: "NOTE",
      tags: ["art direction", "downtime"],
      suggestedProject: "Couch Heroes",
      extractedTasks: [],
      extractedDates: [],
      extractedEntities: [{ type: "PROJECT", name: "Couch Heroes" }],
      clarificationQuestions: [],
      confidenceScore: 0.87,
    } as never);
    mockedUpdate.mockResolvedValue({
      id: "n1",
      summary: "Clarified art-direction note for Couch Heroes downtime styling.",
      confidenceScore: 0.87,
      aiMeta: {
        clarificationQuestions: [],
        clarificationHistory: [
          {
            question: "Which project is this for?",
            answer: "It belongs to Couch Heroes.",
            kind: "freeform",
            createdAt: "2026-04-01T00:00:00.000Z",
          },
        ],
      },
      updatedAt: new Date("2026-04-01T00:00:00.000Z"),
    } as never);

    const response = await POST(
      makeRequest({ question: "Which project is this for?", answer: "It belongs to Couch Heroes." }),
      { params: { id: "n1" } }
    );

    expect(response.status).toBe(200);
    expect(mockedOrganizeNote).toHaveBeenCalledWith(
      "Downtime direction notes",
      expect.objectContaining({
        clarificationContext: expect.stringContaining("It belongs to Couch Heroes."),
      })
    );
    expect(mockedUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          aiMeta: expect.objectContaining({
            clarificationHistory: expect.arrayContaining([
              expect.objectContaining({
                question: "Which project is this for?",
                answer: "It belongs to Couch Heroes.",
              }),
            ]),
          }),
        }),
      })
    );
    expect(mockedRescoreUserReclassificationQueue).toHaveBeenCalledWith("u1");
  });

  it("records project hint usage when a project chip is selected", async () => {
    mockedAuth.mockResolvedValue({ user: { id: "u1" } } as never);
    mockedFindFirst.mockResolvedValue({
      id: "n1",
      rawContent: "Downtime direction notes",
      suggestedProject: null,
      category: null,
      confidenceScore: 0.42,
      aiMeta: {
        clarificationQuestions: ["Which project is this for?"],
        clarificationHistory: [],
      },
    } as never);
    mockedOrganizeNote.mockResolvedValue({
      title: "Couch Heroes downtime direction",
      summary: "Clarified art-direction note for Couch Heroes downtime styling.",
      intent: "Clarify the target visual direction for Couch Heroes downtime work.",
      nextAction: "Update the style guide with the clarified direction",
      priority: "medium",
      category: "Work",
      type: "NOTE",
      tags: ["art direction", "downtime"],
      suggestedProject: "Couch Heroes",
      extractedTasks: [],
      extractedDates: [],
      extractedEntities: [{ type: "PROJECT", name: "Couch Heroes" }],
      clarificationQuestions: [],
      confidenceScore: 0.87,
    } as never);
    mockedUpdate.mockResolvedValue({
      id: "n1",
      summary: "Clarified art-direction note for Couch Heroes downtime styling.",
      confidenceScore: 0.87,
      aiMeta: {},
      updatedAt: new Date("2026-04-01T00:00:00.000Z"),
    } as never);

    const response = await POST(makeRequest({ projectHint: "Couch Heroes" }), { params: { id: "n1" } });

    expect(response.status).toBe(200);
    expect(mockedRecordHintUsage).toHaveBeenCalledWith("u1", "Couch Heroes", "project", 0.42, 0.87);
  });
});