import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/ai", () => ({
  splitNote: vi.fn(),
  organizeNote: vi.fn(),
}));

vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: vi.fn(),
}));

vi.mock("@/lib/userMemory", () => ({
  getThinkingMemory: vi.fn(),
  buildThinkingMemoryPrompt: vi.fn(),
}));

import { auth } from "@/auth";
import { organizeNote, splitNote } from "@/lib/ai";
import { checkRateLimit } from "@/lib/rateLimit";
import { buildThinkingMemoryPrompt, getThinkingMemory } from "@/lib/userMemory";
import { POST } from "./route";

const mockedAuth = vi.mocked(auth);
const mockedSplitNote = vi.mocked(splitNote);
const mockedOrganizeNote = vi.mocked(organizeNote);
const mockedCheckRateLimit = vi.mocked(checkRateLimit);
const mockedGetThinkingMemory = vi.mocked(getThinkingMemory);
const mockedBuildPrompt = vi.mocked(buildThinkingMemoryPrompt);

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/notes/analyze-dump", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/notes/analyze-dump POST", () => {
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
      reviewActionStats: [],
    } as never);
    mockedBuildPrompt.mockReturnValue("Known projects: (none)");
  });

  it("returns 401 when unauthenticated", async () => {
    mockedAuth.mockResolvedValue(null as never);

    const response = await POST(makeRequest({ rawText: "messy dump" }));

    expect(response.status).toBe(401);
  });

  it("returns organized split previews", async () => {
    mockedAuth.mockResolvedValue({ user: { id: "u1" } } as never);
    mockedSplitNote.mockResolvedValue({
      needsSplit: true,
      notes: [{ content: "Call Jim" }, { content: "Buy milk" }],
    } as never);

    mockedOrganizeNote
      .mockResolvedValueOnce({
        title: "Call Jim",
        summary: "Call Jim about invoice issue.",
        category: "Work",
        type: "TASK",
        tags: ["finance"],
        suggestedProject: "QNote",
        extractedTasks: [{ text: "Call Jim" }],
        extractedDates: [],
        extractedEntities: [],
        confidenceScore: 0.8,
        intent: "Resolve invoice issue",
        nextAction: "Call Jim",
        priority: "high",
        clarificationQuestions: [],
      } as never)
      .mockResolvedValueOnce({
        title: "Buy milk",
        summary: "Groceries note.",
        category: "Personal",
        type: "TASK",
        tags: ["home"],
        suggestedProject: null,
        extractedTasks: [{ text: "Buy milk" }],
        extractedDates: [],
        extractedEntities: [],
        confidenceScore: 0.9,
        intent: "Buy groceries",
        nextAction: "Buy milk",
        priority: "medium",
        clarificationQuestions: [],
      } as never);

    const response = await POST(makeRequest({ rawText: "Call Jim. Buy milk." }));
    const payload = (await response.json()) as { count: number; splits: Array<{ title: string }> };

    expect(response.status).toBe(200);
    expect(payload.count).toBe(2);
    expect(payload.splits[0]?.title).toBe("Call Jim");
    expect(payload.splits[1]?.title).toBe("Buy milk");
  });
});
