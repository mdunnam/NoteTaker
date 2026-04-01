import { describe, expect, it } from "vitest";
import {
  inferKnowledgeClustersFromNotes,
  inferNoteKnowledgeContextFromNotes,
  type KnowledgeNoteInput,
} from "@/lib/clusters";

function makeNote(overrides: Partial<KnowledgeNoteInput>): KnowledgeNoteInput {
  return {
    id: "note-1",
    title: "Untitled",
    summary: null,
    rawContent: "raw",
    createdAt: new Date("2026-04-01T00:00:00.000Z"),
    updatedAt: new Date("2026-04-01T00:00:00.000Z"),
    category: "Work",
    type: "NOTE",
    tags: [],
    suggestedProject: null,
    entities: [],
    ...overrides,
  };
}

describe("knowledge cluster inference", () => {
  it("groups notes into a shared topic cluster", () => {
    const notes: KnowledgeNoteInput[] = [
      makeNote({
        id: "n1",
        title: "Downtime issue",
        entities: [{ entity: { id: "e1", name: "Downtime", type: "TOPIC" } }],
      }),
      makeNote({
        id: "n2",
        title: "Downtime follow-up",
        entities: [{ entity: { id: "e2", name: "Downtime", type: "TOPIC" } }],
      }),
    ];

    const clusters = inferKnowledgeClustersFromNotes(notes, { kind: "topic" });

    expect(clusters).toHaveLength(1);
    expect(clusters[0]?.label).toBe("Downtime");
    expect(clusters[0]?.noteCount).toBe(2);
  });

  it("suggests a project when a topic later co-occurs with a known work stream", () => {
    const notes: KnowledgeNoteInput[] = [
      makeNote({
        id: "n1",
        title: "Investigate downtime",
        rawContent: "Need to debug downtime spikes.",
        entities: [{ entity: { id: "e1", name: "Downtime", type: "TOPIC" } }],
        suggestedProject: null,
      }),
      makeNote({
        id: "n2",
        title: "Couch Heroes downtime fix",
        rawContent: "Downtime is affecting Couch Heroes login.",
        suggestedProject: "Couch Heroes",
        entities: [
          { entity: { id: "e2", name: "Downtime", type: "TOPIC" } },
          { entity: { id: "e3", name: "Couch Heroes", type: "PROJECT" } },
        ],
      }),
    ];

    const context = inferNoteKnowledgeContextFromNotes(notes, "n1");

    expect(context?.suggestion?.suggestedProject).toBe("Couch Heroes");
    expect(context?.suggestion?.basedOnTopics).toContain("Downtime");
    expect(context?.suggestion?.supportingNotes[0]?.id).toBe("n2");
  });
});