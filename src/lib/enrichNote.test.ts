import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    note: {
      update: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    entity: {
      upsert: vi.fn(),
    },
    noteEntity: {
      upsert: vi.fn(),
    },
    noteRelation: {
      upsert: vi.fn(),
    },
    $executeRaw: vi.fn(),
  },
}));

vi.mock("@/lib/userMemory", () => ({
  getThinkingMemory: vi.fn(),
  buildThinkingMemoryPrompt: vi.fn(),
  updateThinkingMemory: vi.fn(),
}));

vi.mock("@/lib/clusters", () => ({
  rescoreUserReclassificationQueue: vi.fn(),
}));

vi.mock("@/lib/ai", () => ({
  organizeNote: vi.fn(),
  embedNote: vi.fn(),
  cosineSimilarity: vi.fn(),
}));

import { embedNote, organizeNote, cosineSimilarity } from "@/lib/ai";
import { rescoreUserReclassificationQueue } from "@/lib/clusters";
import { prisma } from "@/lib/db";
import { buildThinkingMemoryPrompt, getThinkingMemory, updateThinkingMemory } from "@/lib/userMemory";
import { enrichNote } from "./enrichNote";

const mockedOrganizeNote = vi.mocked(organizeNote);
const mockedEmbedNote = vi.mocked(embedNote);
const mockedCosineSimilarity = vi.mocked(cosineSimilarity);
const mockedUpdate = vi.mocked(prisma.note.update);
const mockedFindMany = vi.mocked(prisma.note.findMany);
const mockedFindUnique = vi.mocked(prisma.note.findUnique);
const mockedEntityUpsert = vi.mocked(prisma.entity.upsert);
const mockedNoteEntityUpsert = vi.mocked(prisma.noteEntity.upsert);
const mockedNoteRelationUpsert = vi.mocked(prisma.noteRelation.upsert);
const mockedExecuteRaw = vi.mocked(prisma.$executeRaw);
const mockedGetThinkingMemory = vi.mocked(getThinkingMemory);
const mockedBuildThinkingMemoryPrompt = vi.mocked(buildThinkingMemoryPrompt);
const mockedUpdateThinkingMemory = vi.mocked(updateThinkingMemory);
const mockedRescoreUserReclassificationQueue = vi.mocked(rescoreUserReclassificationQueue);

describe("enrichNote", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockedOrganizeNote.mockResolvedValue({
      title: "Call Jim",
      summary: "Discuss invoices",
      category: "Work",
      type: "TASK",
      tags: ["finance"],
      suggestedProject: undefined,
      extractedTasks: [{ text: "Call Jim" }],
      extractedDates: [],
      extractedEntities: [{ type: "PERSON", name: "Jim" }],
      confidenceScore: 0.91,
    });

    mockedUpdate.mockResolvedValue({ id: "n1" } as never);
    mockedEntityUpsert.mockResolvedValue({ id: "e1" } as never);
    mockedNoteEntityUpsert.mockResolvedValue({ id: "ne1" } as never);
    mockedNoteRelationUpsert.mockResolvedValue({ id: "r1" } as never);
    mockedFindMany.mockResolvedValue([] as never);
    mockedExecuteRaw.mockResolvedValue(1 as never);
    mockedCosineSimilarity.mockReturnValue(0.9);
    mockedFindUnique.mockResolvedValue({ suggestedProject: null, category: null } as never);
    mockedGetThinkingMemory.mockResolvedValue({
      knownProjects: [],
      knownContexts: [],
      knownPeople: [],
      knownTopics: [],
      hintStats: [],
    });
    mockedBuildThinkingMemoryPrompt.mockReturnValue("Known projects: (none)");
    mockedUpdateThinkingMemory.mockResolvedValue(undefined);
    mockedRescoreUserReclassificationQueue.mockResolvedValue(undefined);
  });

  it("persists the computed embedding when enrichment succeeds", async () => {
    mockedEmbedNote.mockResolvedValue([0.12, 0.34, 0.56]);

    await enrichNote({
      noteId: "n1",
      userId: "u1",
      rawContent: "Call Jim about invoices",
      fallbackTags: [],
    });

    expect(mockedUpdate).toHaveBeenCalled();
    expect(mockedExecuteRaw).toHaveBeenCalledTimes(1);
    expect(mockedRescoreUserReclassificationQueue).toHaveBeenCalledWith("u1");
  });

  it("falls back gracefully when embedding generation fails", async () => {
    mockedEmbedNote.mockRejectedValue(new Error("embedding failed"));

    await enrichNote({
      noteId: "n1",
      userId: "u1",
      rawContent: "Call Jim about invoices",
      fallbackTags: [],
    });

    expect(mockedUpdate).toHaveBeenCalled();
  });
});
