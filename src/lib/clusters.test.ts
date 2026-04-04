import { describe, expect, it } from "vitest";
import {
  getPersistedReclassificationCandidatesFromNotes,
  inferKnowledgeClustersFromNotes,
  inferNoteKnowledgeContextFromNotes,
  inferReclassificationCandidatesFromNotes,
  type KnowledgeNoteInput,
} from "@/lib/clusters";
import type { ReviewActionStat } from "@/lib/userMemory";

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

  it("surfaces reclassification candidates when newer notes provide stronger project context", () => {
    const notes: KnowledgeNoteInput[] = [
      makeNote({
        id: "n1",
        title: "Downtime art direction",
        rawContent: "Downtime should feel grimy and medieval.",
        createdAt: new Date("2026-03-20T00:00:00.000Z"),
        updatedAt: new Date("2026-03-20T00:00:00.000Z"),
        entities: [{ entity: { id: "e1", name: "Downtime", type: "TOPIC" } }],
        aiMeta: {
          clarificationHistory: [
            {
              question: "What is Downtime?",
              answer: "It is part of the work project but I am still sorting it out.",
              kind: "freeform",
              createdAt: "2026-03-20T00:00:00.000Z",
            },
          ],
        },
        confidenceScore: 0.45,
      }),
      makeNote({
        id: "n2",
        title: "Couch Heroes downtime note",
        rawContent: "Downtime belongs inside Couch Heroes and affects the game tone.",
        createdAt: new Date("2026-03-28T00:00:00.000Z"),
        updatedAt: new Date("2026-03-28T00:00:00.000Z"),
        category: "Worldbuilding",
        suggestedProject: "Couch Heroes",
        entities: [
          { entity: { id: "e2", name: "Downtime", type: "TOPIC" } },
          { entity: { id: "e3", name: "Couch Heroes", type: "PROJECT" } },
        ],
      }),
    ];

    const candidates = inferReclassificationCandidatesFromNotes(notes, 5);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.note.id).toBe("n1");
    expect(candidates[0]?.suggestedProject).toBe("Couch Heroes");
    expect(candidates[0]?.changedByNewerContext).toBe(true);
    expect(candidates[0]?.clarificationTurns).toBe(1);
    expect(candidates[0]?.feedbackKey).toContain("n1");
  });

  it("suppresses reclassification candidates with dismiss-heavy feedback", () => {
    const notes: KnowledgeNoteInput[] = [
      makeNote({
        id: "n1",
        title: "Downtime art direction",
        rawContent: "Downtime should feel grimy and medieval.",
        createdAt: new Date("2026-03-20T00:00:00.000Z"),
        updatedAt: new Date("2026-03-20T00:00:00.000Z"),
        entities: [{ entity: { id: "e1", name: "Downtime", type: "TOPIC" } }],
      }),
      makeNote({
        id: "n2",
        title: "Couch Heroes downtime note",
        rawContent: "Downtime belongs inside Couch Heroes and affects the game tone.",
        createdAt: new Date("2026-03-28T00:00:00.000Z"),
        updatedAt: new Date("2026-03-28T00:00:00.000Z"),
        suggestedProject: "Couch Heroes",
        entities: [
          { entity: { id: "e2", name: "Downtime", type: "TOPIC" } },
          { entity: { id: "e3", name: "Couch Heroes", type: "PROJECT" } },
        ],
      }),
    ];
    const initialCandidates = inferReclassificationCandidatesFromNotes(notes, 5);
    const feedbackKey = initialCandidates[0]?.feedbackKey;
    expect(feedbackKey).toBeTruthy();

    const actionStats: ReviewActionStat[] = [{
      id: feedbackKey!,
      kind: "reclassification",
      label: "Downtime art direction → Couch Heroes · Worldbuilding",
      snoozes: 1,
      dismisses: 2,
      restores: 0,
      lastAction: "dismiss",
      lastActionAt: "2026-04-04T00:00:00.000Z",
    }];

    const candidates = inferReclassificationCandidatesFromNotes(notes, 5, { actionStats });

    expect(candidates).toHaveLength(0);
  });

  it("reads persisted reclassification snapshots from aiMeta without recomputing cluster state", () => {
    const notes: KnowledgeNoteInput[] = [
      makeNote({
        id: "n1",
        title: "Downtime art direction",
        aiMeta: {
          reclassificationSuggestion: {
            feedbackKey: "n1::couch heroes::worldbuilding",
            currentProject: null,
            currentCategory: "Work",
            suggestedProject: "Couch Heroes",
            suggestedCategory: "Worldbuilding",
            reason: "Later notes connect Downtime to Couch Heroes.",
            confidence: 0.88,
            basedOnTopics: ["Downtime"],
            supportingNotes: [
              {
                id: "n2",
                title: "Couch Heroes downtime note",
                summary: "Links the downtime topic to Couch Heroes.",
                category: "Worldbuilding",
                suggestedProject: "Couch Heroes",
                createdAt: "2026-03-28T00:00:00.000Z",
              },
            ],
            changedByNewerContext: true,
            clarificationTurns: 2,
            queuedAt: "2026-04-04T00:00:00.000Z",
          },
        },
      }),
    ];

    const candidates = getPersistedReclassificationCandidatesFromNotes(notes, 5);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.note.id).toBe("n1");
    expect(candidates[0]?.suggestedProject).toBe("Couch Heroes");
    expect(candidates[0]?.clarificationTurns).toBe(2);
    expect(candidates[0]?.feedbackKey).toBe("n1::couch heroes::worldbuilding");
  });
});