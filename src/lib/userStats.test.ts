import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    note: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    noteJob: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    userMetricSnapshot: {
      upsert: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/userMemory", () => ({
  getThinkingMemory: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { getThinkingMemory } from "@/lib/userMemory";
import { getUserStats } from "@/lib/userStats";

const mockedNoteCount = vi.mocked(prisma.note.count);
const mockedNoteFindMany = vi.mocked(prisma.note.findMany);
const mockedNoteJobCount = vi.mocked(prisma.noteJob.count);
const mockedNoteJobFindMany = vi.mocked(prisma.noteJob.findMany);
const mockedSnapshotUpsert = vi.mocked(prisma.userMetricSnapshot.upsert);
const mockedSnapshotFindMany = vi.mocked(prisma.userMetricSnapshot.findMany);
const mockedGetThinkingMemory = vi.mocked(getThinkingMemory);

describe("getUserStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockedNoteCount
      .mockResolvedValueOnce(10 as never)
      .mockResolvedValueOnce(8 as never)
      .mockResolvedValueOnce(1 as never)
      .mockResolvedValueOnce(2 as never);

    mockedNoteJobCount.mockResolvedValue(0 as never);

    mockedNoteFindMany
      .mockResolvedValueOnce([
        { confidenceScore: 0.8 },
        { confidenceScore: 0.6 },
      ] as never)
      .mockResolvedValueOnce([
        { confidenceScore: 0.8 },
        { confidenceScore: 0.6 },
      ] as never)
      .mockResolvedValueOnce([
        { updatedAt: new Date("2026-04-02T00:00:00.000Z"), confidenceScore: 0.6 },
        { updatedAt: new Date("2026-03-20T00:00:00.000Z"), confidenceScore: 0.8 },
      ] as never);

    mockedNoteJobFindMany
      .mockResolvedValueOnce([
        {
          processedAt: new Date("2026-04-03T00:00:20.000Z"),
          note: { createdAt: new Date("2026-04-03T00:00:00.000Z") },
        },
      ] as never)
      .mockResolvedValueOnce([
        {
          processedAt: new Date("2026-04-03T00:00:00.000Z"),
          note: { createdAt: new Date("2026-04-03T00:00:10.000Z") },
        },
      ] as never)
      .mockResolvedValueOnce([
        {
          processedAt: new Date("2026-04-03T00:00:20.000Z"),
          note: { createdAt: new Date("2026-04-03T00:00:00.000Z") },
        },
      ] as never);

    mockedSnapshotUpsert.mockResolvedValue({} as never);
    mockedSnapshotFindMany.mockResolvedValue([
      {
        snapshotDate: new Date("2026-03-31T00:00:00.000Z"),
        avgConfidence: 0.7,
        clarificationRate: 0.3,
        avgTimeToResolutionMs: 1800,
      },
      {
        snapshotDate: new Date("2026-04-04T00:00:00.000Z"),
        avgConfidence: 0.75,
        clarificationRate: 0.25,
        avgTimeToResolutionMs: 1200,
      },
    ] as never);

    mockedGetThinkingMemory.mockResolvedValue({
      knownProjects: [],
      knownContexts: [],
      knownPeople: [],
      knownTopics: [],
      hintStats: [
        {
          hint: "QNote",
          kind: "project",
          uses: 2,
          totalConfidenceLift: 0.1,
          lastUsed: "2026-04-04T00:00:00.000Z",
        },
      ],
      reviewState: {
        forgottenNotes: [],
        patterns: [],
        reclassifications: [],
      },
      reviewActionStats: [],
      clarificationQuestionStats: [
        {
          key: "project",
          label: "Which project is this for?",
          answers: 0,
          dismisses: 2,
          restores: 0,
          lastAction: "dismissed",
          lastActionAt: "2026-04-03T00:00:00.000Z",
        },
        {
          key: "context",
          label: "What context is this in?",
          answers: 0,
          dismisses: 1,
          restores: 0,
          lastAction: "dismissed",
          lastActionAt: "2026-04-02T00:00:00.000Z",
        },
      ],
      clarificationQuestionEvents: [
        {
          key: "project",
          label: "Which project is this for?",
          action: "dismissed",
          createdAt: new Date().toISOString(),
        },
        {
          key: "context",
          label: "What context is this in?",
          action: "answered",
          createdAt: new Date().toISOString(),
        },
        {
          key: "project",
          label: "Which project is this for?",
          action: "dismissed",
          createdAt: "2026-03-20T00:00:00.000Z",
        },
      ],
    } as never);
  });

  it("includes clarification noise metrics derived from user feedback events", async () => {
    const stats = await getUserStats("u1");

    expect(stats.clarificationDismissRate).toBeCloseTo(2 / 3, 5);
    expect(stats.clarificationFeedbackCount).toBe(3);
    expect(stats.clarificationSuppressedStyles).toBe(1);
    expect(stats.clarificationDownrankedStyles).toBe(1);
    expect(stats.trends.clarificationDismissRate.betterWhen).toBe("lower");
    expect(stats.history.clarificationDismissRate).toHaveLength(30);
  });
});