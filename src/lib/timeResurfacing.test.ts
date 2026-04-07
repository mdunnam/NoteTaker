import { describe, expect, it } from "vitest";

import { buildTimeResurfacingSummary } from "./timeResurfacing";

const now = new Date("2026-04-07T18:30:00.000Z");

describe("buildTimeResurfacingSummary", () => {
  it("collects today's open tasks and today's strongest note connections", () => {
    const summary = buildTimeResurfacingSummary([
      {
        id: "n1",
        title: "Launch checklist",
        summary: null,
        createdAt: new Date("2026-04-07T09:00:00.000Z"),
        updatedAt: new Date("2026-04-07T09:00:00.000Z"),
        suggestedProject: "Launch",
        category: "Work",
        tags: ["release"],
        extractedTasks: [{ text: "Draft launch checklist" }],
      },
      {
        id: "n2",
        title: "Launch risks",
        summary: null,
        createdAt: new Date("2026-04-07T11:00:00.000Z"),
        updatedAt: new Date("2026-04-07T11:00:00.000Z"),
        suggestedProject: "Launch",
        category: "Work",
        tags: ["release"],
        extractedTasks: [{ text: "Review blockers", completed: false }],
      },
    ], { now, reclassificationCount: 1 });

    expect(summary.todayTasks).toHaveLength(2);
    expect(summary.todayConnections[0]?.label).toBe("Launch");
    expect(summary.todayConnections[0]?.reason).toContain("2 notes from today connect around Launch");
    expect(summary.weeklyRegroupingCount).toBe(1);
  });

  it("builds weekly thread candidates from repeated recent signals", () => {
    const summary = buildTimeResurfacingSummary([
      {
        id: "n1",
        title: "Incident 1",
        summary: null,
        createdAt: new Date("2026-04-03T09:00:00.000Z"),
        updatedAt: new Date("2026-04-03T09:00:00.000Z"),
        suggestedProject: null,
        category: "Work",
        tags: ["incident"],
        extractedTasks: [],
      },
      {
        id: "n2",
        title: "Incident 2",
        summary: null,
        createdAt: new Date("2026-04-05T09:00:00.000Z"),
        updatedAt: new Date("2026-04-05T09:00:00.000Z"),
        suggestedProject: null,
        category: "Work",
        tags: ["incident"],
        extractedTasks: [],
      },
      {
        id: "n3",
        title: "Incident 3",
        summary: null,
        createdAt: new Date("2026-04-06T09:00:00.000Z"),
        updatedAt: new Date("2026-04-06T09:00:00.000Z"),
        suggestedProject: null,
        category: "Work",
        tags: ["incident"],
        extractedTasks: [],
      },
    ], { now, reviewPatterns: [{ id: "p1", label: "Incidents", kind: "topic", noteCount: 3, reason: "Recurring", lastSeenAt: now.toISOString(), supportingNotes: [] }] });

    expect(summary.weeklyThreads[0]?.label).toBe("Work");
    expect(summary.weeklyPatternCount).toBe(1);
  });
});