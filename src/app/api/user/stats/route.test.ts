import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/userStats", () => ({
  getUserStats: vi.fn(),
}));

import { auth } from "@/auth";
import { getUserStats } from "@/lib/userStats";
import { GET } from "./route";

const mockedAuth = vi.mocked(auth);
const mockedGetUserStats = vi.mocked(getUserStats);

describe("/api/user/stats GET", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockedAuth.mockResolvedValue(null as never);

    const response = await GET();

    expect(response.status).toBe(401);
  });

  it("returns stats payload", async () => {
    mockedAuth.mockResolvedValue({ user: { id: "u1" } } as never);
    mockedGetUserStats.mockResolvedValue({
      totalNotes: 10,
      processedNotes: 8,
      stillProcessing: 1,
      lowConfidenceCount: 2,
      clarificationRate: 0.25,
      clarificationConversionRate: 0.5,
      clarificationDismissRate: 0.33,
      clarificationFeedbackCount: 9,
      clarificationDownrankedStyles: 2,
      clarificationSuppressedStyles: 1,
      avgConfidence: 0.72,
      avgHintLift: 0.11,
      hintUses: 6,
      avgTimeToResolutionMs: 1700,
      failedJobs: 0,
      trends: {
        confidence: { last7: 0.75, last30: 0.7, delta: 0.05, direction: "up", betterWhen: "higher" },
        clarificationRate: { last7: 0.2, last30: 0.3, delta: -0.1, direction: "down", betterWhen: "lower" },
        clarificationDismissRate: { last7: 0.2, last30: 0.33, delta: -0.13, direction: "down", betterWhen: "lower" },
        resolutionTimeMs: { last7: 1500, last30: 1800, delta: -300, direction: "down", betterWhen: "lower" },
      },
      history: {
        confidence: [
          { date: "2026-03-01T00:00:00.000Z", value: 0.62 },
          { date: "2026-03-31T00:00:00.000Z", value: 0.72 },
        ],
        clarificationRate: [
          { date: "2026-03-01T00:00:00.000Z", value: 0.4 },
          { date: "2026-03-31T00:00:00.000Z", value: 0.25 },
        ],
        clarificationDismissRate: [
          { date: "2026-03-01T00:00:00.000Z", value: 0.5 },
          { date: "2026-03-31T00:00:00.000Z", value: 0.33 },
        ],
        resolutionTimeMs: [
          { date: "2026-03-01T00:00:00.000Z", value: 2100 },
          { date: "2026-03-31T00:00:00.000Z", value: 1700 },
        ],
      },
    });

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.totalNotes).toBe(10);
    expect(payload.avgConfidence).toBe(0.72);
  });
});
