import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    userPreferences: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/db";
import { recordClarificationQuestionFeedback, restoreReviewItem, suppressReviewItem } from "@/lib/userMemory";

const mockedFindUnique = vi.mocked(prisma.userPreferences.findUnique);
const mockedUpsert = vi.mocked(prisma.userPreferences.upsert);

describe("userMemory review state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUpsert.mockResolvedValue({} as never);
  });

  it("records dismiss telemetry when suppressing a pattern", async () => {
    mockedFindUnique.mockResolvedValue({
      thinkingMemory: {
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
      },
    } as never);

    await suppressReviewItem("u1", "pattern", "topic:downtime", "dismiss", 30, "Downtime");

    expect(mockedUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          thinkingMemory: expect.objectContaining({
            reviewState: expect.objectContaining({
              patterns: expect.arrayContaining([
                expect.objectContaining({ id: "topic:downtime", label: "Downtime" }),
              ]),
            }),
            reviewActionStats: expect.arrayContaining([
              expect.objectContaining({
                id: "topic:downtime",
                kind: "pattern",
                dismisses: 1,
                snoozes: 0,
                restores: 0,
                lastAction: "dismiss",
              }),
            ]),
          }),
        }),
      })
    );
  });

  it("records restore telemetry and removes the suppression", async () => {
    mockedFindUnique.mockResolvedValue({
      thinkingMemory: {
        knownProjects: [],
        knownContexts: [],
        knownPeople: [],
        knownTopics: [],
        hintStats: [],
        reviewState: {
          forgottenNotes: [{ id: "n1", until: "2026-04-20T00:00:00.000Z", label: "Old task note" }],
          patterns: [],
          reclassifications: [],
        },
        reviewActionStats: [
          {
            id: "n1",
            kind: "forgotten-note",
            label: "Old task note",
            snoozes: 1,
            dismisses: 0,
            restores: 0,
            lastAction: "snooze",
            lastActionAt: "2026-04-01T00:00:00.000Z",
          },
        ],
      },
    } as never);

    await restoreReviewItem("u1", "forgotten-note", "n1");

    expect(mockedUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          thinkingMemory: expect.objectContaining({
            reviewState: expect.objectContaining({
              forgottenNotes: [],
              reclassifications: [],
            }),
            reviewActionStats: expect.arrayContaining([
              expect.objectContaining({
                id: "n1",
                kind: "forgotten-note",
                restores: 1,
                snoozes: 1,
                lastAction: "restore",
              }),
            ]),
          }),
        }),
      })
    );
  });

  it("records answered clarification feedback by question style", async () => {
    mockedFindUnique.mockResolvedValue({
      thinkingMemory: {
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
        clarificationQuestionStats: [],
      },
    } as never);

    await recordClarificationQuestionFeedback("u1", "Which project is this for?", "answered");

    expect(mockedUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          thinkingMemory: expect.objectContaining({
            clarificationQuestionStats: expect.arrayContaining([
              expect.objectContaining({
                key: "project",
                answers: 1,
                dismisses: 0,
                lastAction: "answered",
              }),
            ]),
          }),
        }),
      })
    );
  });
});