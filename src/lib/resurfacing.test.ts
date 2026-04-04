import { describe, expect, it } from "vitest";
import {
  inferForgottenNoteCandidatesFromNotes,
  inferReviewPatternsFromNotes,
  type ResurfacingNoteInput,
} from "@/lib/resurfacing";

function makeNote(overrides: Partial<ResurfacingNoteInput>): ResurfacingNoteInput {
  return {
    id: "note-1",
    title: "Untitled",
    summary: null,
    rawContent: "raw",
    createdAt: new Date("2026-04-01T00:00:00.000Z"),
    updatedAt: new Date("2026-04-01T00:00:00.000Z"),
    category: "Work",
    tags: [],
    suggestedProject: null,
    priority: null,
    extractedTasks: [],
    isPinned: false,
    entities: [],
    ...overrides,
  };
}

describe("resurfacing heuristics", () => {
  it("surfaces an older note when recent work overlaps the same topic", () => {
    const now = new Date("2026-04-04T00:00:00.000Z");
    const notes: ResurfacingNoteInput[] = [
      makeNote({
        id: "n1",
        title: "Old downtime sketch",
        createdAt: new Date("2026-03-10T00:00:00.000Z"),
        updatedAt: new Date("2026-03-11T00:00:00.000Z"),
        entities: [{ entity: { id: "e1", name: "Downtime", type: "TOPIC" } }],
        extractedTasks: [{ text: "Refine the downtime pitch" }],
      }),
      makeNote({
        id: "n2",
        title: "Current downtime note",
        createdAt: new Date("2026-04-02T00:00:00.000Z"),
        updatedAt: new Date("2026-04-02T00:00:00.000Z"),
        entities: [{ entity: { id: "e2", name: "Downtime", type: "TOPIC" } }],
      }),
    ];

    const forgotten = inferForgottenNoteCandidatesFromNotes(notes, { now, limit: 5 });

    expect(forgotten).toHaveLength(1);
    expect(forgotten[0]?.note.id).toBe("n1");
    expect(forgotten[0]?.overlapSignals).toContain("Downtime");
  });

  it("surfaces an older note with extracted tasks even without recent overlap", () => {
    const now = new Date("2026-04-04T00:00:00.000Z");
    const notes: ResurfacingNoteInput[] = [
      makeNote({
        id: "n1",
        title: "Old task note",
        createdAt: new Date("2026-03-01T00:00:00.000Z"),
        updatedAt: new Date("2026-03-05T00:00:00.000Z"),
        extractedTasks: [{ text: "Follow up with vendor" }, { text: "Review invoice" }],
      }),
    ];

    const forgotten = inferForgottenNoteCandidatesFromNotes(notes, { now, limit: 5 });

    expect(forgotten).toHaveLength(1);
    expect(forgotten[0]?.extractedTaskCount).toBe(2);
    expect(forgotten[0]?.reason).toContain("2 extracted tasks");
  });

  it("groups repeated recent project and topic patterns into review cards", () => {
    const now = new Date("2026-04-04T00:00:00.000Z");
    const notes: ResurfacingNoteInput[] = [
      makeNote({
        id: "n1",
        title: "Downtime note 1",
        createdAt: new Date("2026-04-01T00:00:00.000Z"),
        updatedAt: new Date("2026-04-01T00:00:00.000Z"),
        suggestedProject: "Couch Heroes",
        entities: [{ entity: { id: "e1", name: "Downtime", type: "TOPIC" } }],
      }),
      makeNote({
        id: "n2",
        title: "Downtime note 2",
        createdAt: new Date("2026-04-02T00:00:00.000Z"),
        updatedAt: new Date("2026-04-02T00:00:00.000Z"),
        suggestedProject: "Couch Heroes",
        entities: [{ entity: { id: "e2", name: "Downtime", type: "TOPIC" } }],
      }),
      makeNote({
        id: "n3",
        title: "Downtime note 3",
        createdAt: new Date("2026-04-03T00:00:00.000Z"),
        updatedAt: new Date("2026-04-03T00:00:00.000Z"),
        suggestedProject: "Couch Heroes",
        entities: [{ entity: { id: "e3", name: "Downtime", type: "TOPIC" } }],
      }),
    ];

    const patterns = inferReviewPatternsFromNotes(notes, { now, limit: 5 });

    expect(patterns.length).toBeGreaterThanOrEqual(2);
    expect(patterns.some((pattern) => pattern.label === "Couch Heroes" && pattern.kind === "project")).toBe(true);
    expect(patterns.some((pattern) => pattern.label === "Downtime" && pattern.kind === "topic")).toBe(true);
  });
});