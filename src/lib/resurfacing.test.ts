import { describe, expect, it } from "vitest";
import {
  inferForgottenNoteCandidatesFromNotes,
  inferReviewPatternsFromNotes,
  type ResurfacingNoteInput,
} from "@/lib/resurfacing";
import { getReviewNoiseAssessment } from "@/lib/reviewFeedback";
import type { ReviewActionStat } from "@/lib/userMemory";

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

  it("detects recurring idea threads even without explicit entities or tags", () => {
    const now = new Date("2026-04-05T00:00:00.000Z");
    const notes: ResurfacingNoteInput[] = [
      makeNote({
        id: "i1",
        title: "Pricing strategy for SMB onboarding",
        summary: "Thinking through the pricing strategy for onboarding smaller teams.",
        rawContent: "Pricing strategy should reduce onboarding friction for SMB customers.",
        createdAt: new Date("2026-04-02T00:00:00.000Z"),
        updatedAt: new Date("2026-04-02T00:00:00.000Z"),
      }),
      makeNote({
        id: "i2",
        title: "SMB pricing strategy follow-up",
        summary: "Need a sharper pricing strategy for the SMB motion.",
        rawContent: "Follow-up on pricing strategy and onboarding for SMB accounts.",
        createdAt: new Date("2026-04-03T00:00:00.000Z"),
        updatedAt: new Date("2026-04-03T00:00:00.000Z"),
      }),
      makeNote({
        id: "i3",
        title: "Onboarding and pricing strategy questions",
        summary: "More pricing strategy questions coming up from onboarding calls.",
        rawContent: "Pricing strategy is still fuzzy for onboarding smaller teams.",
        createdAt: new Date("2026-04-04T00:00:00.000Z"),
        updatedAt: new Date("2026-04-04T00:00:00.000Z"),
      }),
    ];

    const patterns = inferReviewPatternsFromNotes(notes, { now, limit: 5 });

    expect(patterns.some((pattern) => pattern.kind === "idea" && pattern.noteCount === 3)).toBe(true);
  });

  it("suppresses forgotten notes with heavy dismiss history", () => {
    const now = new Date("2026-04-04T00:00:00.000Z");
    const notes: ResurfacingNoteInput[] = [
      makeNote({
        id: "n1",
        title: "Old noisy note",
        createdAt: new Date("2026-03-01T00:00:00.000Z"),
        updatedAt: new Date("2026-03-05T00:00:00.000Z"),
        extractedTasks: [{ text: "Follow up" }],
      }),
    ];
    const actionStats: ReviewActionStat[] = [{
      id: "n1",
      kind: "forgotten-note",
      label: "Old noisy note",
      snoozes: 1,
      dismisses: 2,
      restores: 0,
      lastAction: "dismiss",
      lastActionAt: "2026-04-03T00:00:00.000Z",
    }];

    const forgotten = inferForgottenNoteCandidatesFromNotes(notes, { now, limit: 5, actionStats });

    expect(forgotten).toHaveLength(0);
  });

  it("downranks noisy patterns below cleaner ones", () => {
    const now = new Date("2026-04-04T00:00:00.000Z");
    const notes: ResurfacingNoteInput[] = [
      makeNote({
        id: "a1",
        title: "Launch note 1",
        createdAt: new Date("2026-04-01T00:00:00.000Z"),
        updatedAt: new Date("2026-04-01T00:00:00.000Z"),
        entities: [{ entity: { id: "e1", name: "Launch", type: "TOPIC" } }],
      }),
      makeNote({
        id: "a2",
        title: "Launch note 2",
        createdAt: new Date("2026-04-02T00:00:00.000Z"),
        updatedAt: new Date("2026-04-02T00:00:00.000Z"),
        entities: [{ entity: { id: "e2", name: "Launch", type: "TOPIC" } }],
      }),
      makeNote({
        id: "a3",
        title: "Launch note 3",
        createdAt: new Date("2026-04-03T00:00:00.000Z"),
        updatedAt: new Date("2026-04-03T00:00:00.000Z"),
        entities: [{ entity: { id: "e3", name: "Launch", type: "TOPIC" } }],
      }),
      makeNote({
        id: "b1",
        title: "Downtime note 1",
        createdAt: new Date("2026-04-01T00:00:00.000Z"),
        updatedAt: new Date("2026-04-01T00:00:00.000Z"),
        entities: [{ entity: { id: "e4", name: "Downtime", type: "TOPIC" } }],
      }),
      makeNote({
        id: "b2",
        title: "Downtime note 2",
        createdAt: new Date("2026-04-02T00:00:00.000Z"),
        updatedAt: new Date("2026-04-02T00:00:00.000Z"),
        entities: [{ entity: { id: "e5", name: "Downtime", type: "TOPIC" } }],
      }),
      makeNote({
        id: "b3",
        title: "Downtime note 3",
        createdAt: new Date("2026-04-03T00:00:00.000Z"),
        updatedAt: new Date("2026-04-03T00:00:00.000Z"),
        entities: [{ entity: { id: "e6", name: "Downtime", type: "TOPIC" } }],
      }),
    ];
    const actionStats: ReviewActionStat[] = [{
      id: "topic:downtime",
      kind: "pattern",
      label: "Downtime",
      snoozes: 0,
      dismisses: 1,
      restores: 0,
      lastAction: "dismiss",
      lastActionAt: "2026-04-03T00:00:00.000Z",
    }];

    const patterns = inferReviewPatternsFromNotes(notes, { now, limit: 5, actionStats });

    expect(patterns[0]?.label).toBe("Launch");
    expect(patterns.some((pattern) => pattern.label === "Downtime")).toBe(true);
  });

  it("treats restores as offsets against prior noise", () => {
    const assessment = getReviewNoiseAssessment({
      id: "topic:downtime",
      kind: "pattern",
      label: "Downtime",
      snoozes: 1,
      dismisses: 1,
      restores: 2,
      lastAction: "restore",
      lastActionAt: "2026-04-04T00:00:00.000Z",
    });

    expect(assessment.level).toBe("normal");
    expect(assessment.penalty).toBe(0);
  });
});