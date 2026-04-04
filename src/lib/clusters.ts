import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { parseNoteAiMeta } from "@/lib/clarification";

type KnowledgeEntityType = "PROJECT" | "APP" | "TOPIC" | "COMPANY" | "PERSON" | "PLACE";

interface KnowledgeNoteEntity {
  entity: {
    id: string;
    name: string;
    type: KnowledgeEntityType;
  };
}

export interface KnowledgeNoteInput {
  id: string;
  title: string | null;
  summary: string | null;
  rawContent: string;
  createdAt: Date;
  updatedAt: Date;
  category: string | null;
  type: string | null;
  tags: string[];
  suggestedProject: string | null;
  confidenceScore?: number | null;
  aiMeta?: unknown;
  entities: KnowledgeNoteEntity[];
}

type KnowledgeNote = KnowledgeNoteInput;

export interface ClusterNotePreview {
  id: string;
  title: string | null;
  summary: string | null;
  category: string | null;
  suggestedProject: string | null;
  createdAt: string;
}

export interface KnowledgeCluster {
  id: string;
  kind: "project" | "topic";
  label: string;
  noteCount: number;
  dominantCategory: string | null;
  crossReferences: string[];
  notes: ClusterNotePreview[];
}

export interface ReorganizationSuggestion {
  suggestedProject: string | null;
  suggestedCategory: string | null;
  reason: string;
  confidence: number;
  basedOnTopics: string[];
  supportingNotes: ClusterNotePreview[];
}

export interface NoteKnowledgeContext {
  clusters: KnowledgeCluster[];
  suggestion: ReorganizationSuggestion | null;
}

export interface ReclassificationCandidate {
  note: ClusterNotePreview;
  currentProject: string | null;
  currentCategory: string | null;
  suggestedProject: string | null;
  suggestedCategory: string | null;
  reason: string;
  confidence: number;
  basedOnTopics: string[];
  supportingNotes: ClusterNotePreview[];
  changedByNewerContext: boolean;
  clarificationTurns: number;
}

interface PersistedReclassificationSuggestion {
  currentProject: string | null;
  currentCategory: string | null;
  suggestedProject: string | null;
  suggestedCategory: string | null;
  reason: string;
  confidence: number;
  basedOnTopics: string[];
  supportingNotes: ClusterNotePreview[];
  changedByNewerContext: boolean;
  clarificationTurns: number;
  queuedAt: string;
}

interface ClusterAccumulator {
  id: string;
  kind: "project" | "topic";
  label: string;
  notes: KnowledgeNote[];
  crossReferences: Map<string, number>;
}

interface ProjectCandidate {
  label: string;
  score: number;
  topics: Set<string>;
  supportingNotes: KnowledgeNote[];
}

/** Normalize a cluster or signal label for matching. */
function normalizeSignalLabel(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/** Return a mutable aiMeta record shape when present, else an empty object. */
function getAiMetaRecord(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }

  return raw as Record<string, unknown>;
}

/** Build a stable cluster id from kind and label. */
function buildClusterId(kind: "project" | "topic", label: string): string {
  return `${kind}:${normalizeSignalLabel(label).toLowerCase()}`;
}

/** Convert a note into a small preview payload for UI consumption. */
function toClusterNotePreview(note: KnowledgeNote): ClusterNotePreview {
  return {
    id: note.id,
    title: note.title,
    summary: note.summary || note.rawContent.slice(0, 180),
    category: note.category,
    suggestedProject: note.suggestedProject,
    createdAt: note.createdAt.toISOString(),
  };
}

/** Persist only the stable parts of a reclassification candidate into aiMeta. */
function toPersistedReclassificationSuggestion(
  candidate: ReclassificationCandidate,
  queuedAt: string
): PersistedReclassificationSuggestion {
  return {
    currentProject: candidate.currentProject,
    currentCategory: candidate.currentCategory,
    suggestedProject: candidate.suggestedProject,
    suggestedCategory: candidate.suggestedCategory,
    reason: candidate.reason,
    confidence: candidate.confidence,
    basedOnTopics: candidate.basedOnTopics,
    supportingNotes: candidate.supportingNotes,
    changedByNewerContext: candidate.changedByNewerContext,
    clarificationTurns: candidate.clarificationTurns,
    queuedAt,
  };
}

/** Parse a persisted reclassification snapshot from note aiMeta. */
function parsePersistedReclassificationSuggestion(raw: unknown): PersistedReclassificationSuggestion | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const value = raw as Record<string, unknown>;
  if (
    typeof value.reason !== "string" ||
    typeof value.confidence !== "number" ||
    typeof value.queuedAt !== "string" ||
    !Array.isArray(value.basedOnTopics) ||
    !Array.isArray(value.supportingNotes) ||
    typeof value.changedByNewerContext !== "boolean" ||
    typeof value.clarificationTurns !== "number"
  ) {
    return null;
  }

  return {
    currentProject: typeof value.currentProject === "string" ? value.currentProject : null,
    currentCategory: typeof value.currentCategory === "string" ? value.currentCategory : null,
    suggestedProject: typeof value.suggestedProject === "string" ? value.suggestedProject : null,
    suggestedCategory: typeof value.suggestedCategory === "string" ? value.suggestedCategory : null,
    reason: value.reason,
    confidence: value.confidence,
    basedOnTopics: value.basedOnTopics.filter((topic): topic is string => typeof topic === "string"),
    supportingNotes: value.supportingNotes.filter((note): note is ClusterNotePreview => {
      if (!note || typeof note !== "object" || Array.isArray(note)) {
        return false;
      }

      const preview = note as Record<string, unknown>;
      return (
        typeof preview.id === "string" &&
        (typeof preview.title === "string" || preview.title === null) &&
        (typeof preview.summary === "string" || preview.summary === null) &&
        (typeof preview.category === "string" || preview.category === null) &&
        (typeof preview.suggestedProject === "string" || preview.suggestedProject === null) &&
        typeof preview.createdAt === "string"
      );
    }),
    changedByNewerContext: value.changedByNewerContext,
    clarificationTurns: value.clarificationTurns,
    queuedAt: value.queuedAt,
  };
}

/** Compare persisted and computed suggestions without treating queuedAt changes as meaningful. */
function isSameReclassificationSuggestion(
  existing: PersistedReclassificationSuggestion | null,
  candidate: ReclassificationCandidate | null
): boolean {
  if (!existing && !candidate) {
    return true;
  }

  if (!existing || !candidate) {
    return false;
  }

  return JSON.stringify({
    currentProject: existing.currentProject,
    currentCategory: existing.currentCategory,
    suggestedProject: existing.suggestedProject,
    suggestedCategory: existing.suggestedCategory,
    reason: existing.reason,
    confidence: existing.confidence,
    basedOnTopics: existing.basedOnTopics,
    supportingNotes: existing.supportingNotes,
    changedByNewerContext: existing.changedByNewerContext,
    clarificationTurns: existing.clarificationTurns,
  }) === JSON.stringify({
    currentProject: candidate.currentProject,
    currentCategory: candidate.currentCategory,
    suggestedProject: candidate.suggestedProject,
    suggestedCategory: candidate.suggestedCategory,
    reason: candidate.reason,
    confidence: candidate.confidence,
    basedOnTopics: candidate.basedOnTopics,
    supportingNotes: candidate.supportingNotes,
    changedByNewerContext: candidate.changedByNewerContext,
    clarificationTurns: candidate.clarificationTurns,
  });
}

/** Collect project signals from a note. */
function getProjectSignals(note: KnowledgeNote): string[] {
  const signals = new Set<string>();

  if (note.suggestedProject?.trim()) {
    signals.add(normalizeSignalLabel(note.suggestedProject));
  }

  for (const entity of note.entities) {
    if (entity.entity.type === "PROJECT" || entity.entity.type === "APP") {
      signals.add(normalizeSignalLabel(entity.entity.name));
    }
  }

  return [...signals];
}

/** Collect topic signals from a note. */
function getTopicSignals(note: KnowledgeNote): string[] {
  const signals = new Set<string>();

  for (const entity of note.entities) {
    if (entity.entity.type === "TOPIC" || entity.entity.type === "COMPANY") {
      signals.add(normalizeSignalLabel(entity.entity.name));
    }
  }

  for (const tag of note.tags || []) {
    const normalizedTag = normalizeSignalLabel(tag);
    if (normalizedTag) {
      signals.add(normalizedTag);
    }
  }

  return [...signals];
}

/** Pick the most common non-empty category from a note set. */
function getDominantCategory(notes: KnowledgeNote[]): string | null {
  const counts = new Map<string, number>();

  for (const note of notes) {
    const category = note.category?.trim();
    if (!category) {
      continue;
    }
    counts.set(category, (counts.get(category) || 0) + 1);
  }

  const winner = [...counts.entries()].sort((left, right) => right[1] - left[1])[0];
  return winner?.[0] || null;
}

/** Load processed notes with entity links for clustering and context inference. */
async function loadKnowledgeNotes(userId: string): Promise<KnowledgeNote[]> {
  return prisma.note.findMany({
    where: {
      userId,
      isArchived: false,
      status: "PROCESSED",
    },
    orderBy: {
      updatedAt: "desc",
    },
    take: 400,
    select: {
      id: true,
      title: true,
      summary: true,
      rawContent: true,
      createdAt: true,
      updatedAt: true,
      category: true,
      type: true,
      tags: true,
      suggestedProject: true,
      confidenceScore: true,
      aiMeta: true,
      entities: {
        include: {
          entity: {
            select: {
              id: true,
              name: true,
              type: true,
            },
          },
        },
      },
    },
  });
}

/** Build project and topic cluster maps from note signals. */
function buildClusterMaps(notes: KnowledgeNote[]) {
  const clusters = new Map<string, ClusterAccumulator>();

  for (const note of notes) {
    const projectSignals = getProjectSignals(note);
    const topicSignals = getTopicSignals(note);

    for (const label of projectSignals) {
      const clusterId = buildClusterId("project", label);
      const current = clusters.get(clusterId) || {
        id: clusterId,
        kind: "project" as const,
        label,
        notes: [],
        crossReferences: new Map<string, number>(),
      };
      current.notes.push(note);

      for (const topic of topicSignals) {
        current.crossReferences.set(topic, (current.crossReferences.get(topic) || 0) + 1);
      }

      clusters.set(clusterId, current);
    }

    for (const label of topicSignals) {
      const clusterId = buildClusterId("topic", label);
      const current = clusters.get(clusterId) || {
        id: clusterId,
        kind: "topic" as const,
        label,
        notes: [],
        crossReferences: new Map<string, number>(),
      };
      current.notes.push(note);

      for (const project of projectSignals) {
        current.crossReferences.set(project, (current.crossReferences.get(project) || 0) + 1);
      }

      clusters.set(clusterId, current);
    }
  }

  return clusters;
}

/** Convert an internal cluster accumulator into a UI-friendly cluster. */
function toKnowledgeCluster(cluster: ClusterAccumulator): KnowledgeCluster {
  const uniqueNotes = [...new Map(cluster.notes.map((note) => [note.id, note])).values()];

  return {
    id: cluster.id,
    kind: cluster.kind,
    label: cluster.label,
    noteCount: uniqueNotes.length,
    dominantCategory: getDominantCategory(uniqueNotes),
    crossReferences: [...cluster.crossReferences.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 4)
      .map(([label]) => label),
    notes: uniqueNotes
      .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())
      .slice(0, 6)
      .map(toClusterNotePreview),
  };
}

/** Infer a project suggestion for a note from topic-to-project co-occurrence across the note corpus. */
function inferProjectSuggestion(notes: KnowledgeNote[], targetNote: KnowledgeNote): ReorganizationSuggestion | null {
  const existingProjects = new Set(getProjectSignals(targetNote).map((label) => label.toLowerCase()));
  const topicSignals = getTopicSignals(targetNote);

  if (topicSignals.length === 0) {
    return null;
  }

  const candidates = new Map<string, ProjectCandidate>();

  for (const note of notes) {
    if (note.id === targetNote.id) {
      continue;
    }

    const noteTopics = new Set(getTopicSignals(note).map((label) => label.toLowerCase()));
    const sharedTopics = topicSignals.filter((topic) => noteTopics.has(topic.toLowerCase()));
    if (sharedTopics.length === 0) {
      continue;
    }

    const noteProjects = getProjectSignals(note);
    for (const project of noteProjects) {
      const normalizedProject = project.toLowerCase();
      const current = candidates.get(normalizedProject) || {
        label: project,
        score: 0,
        topics: new Set<string>(),
        supportingNotes: [],
      };

      current.score += sharedTopics.length;
      for (const topic of sharedTopics) {
        current.topics.add(topic);
      }

      if (!current.supportingNotes.some((candidateNote) => candidateNote.id === note.id)) {
        current.supportingNotes.push(note);
      }

      candidates.set(normalizedProject, current);
    }
  }

  const best = [...candidates.values()].sort((left, right) => right.score - left.score)[0];
  if (!best) {
    return null;
  }

  if (existingProjects.has(best.label.toLowerCase())) {
    return null;
  }

  const supportingNotes = best.supportingNotes
    .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())
    .slice(0, 3);

  const suggestedCategory = getDominantCategory(supportingNotes);
  const confidence = Math.min(0.95, 0.5 + best.score * 0.1 + supportingNotes.length * 0.05);
  const joinedTopics = [...best.topics].slice(0, 3);

  return {
    suggestedProject: best.label,
    suggestedCategory,
    reason: joinedTopics.length > 0
      ? `Notes mentioning ${joinedTopics.join(", ")} are already clustering under ${best.label}.`
      : `${best.label} is the strongest project signal among related notes.`,
    confidence,
    basedOnTopics: joinedTopics,
    supportingNotes: supportingNotes.map(toClusterNotePreview),
  };
}

/**
 * Infer browsable knowledge clusters from an in-memory note set.
 */
export function inferKnowledgeClustersFromNotes(
  notes: KnowledgeNote[],
  options?: { kind?: "project" | "topic" }
): KnowledgeCluster[] {
  const clusterMap = buildClusterMaps(notes);

  return [...clusterMap.values()]
    .map(toKnowledgeCluster)
    .filter((cluster) => cluster.noteCount >= 2)
    .filter((cluster) => !options?.kind || cluster.kind === options.kind)
    .sort((left, right) => right.noteCount - left.noteCount || left.label.localeCompare(right.label));
}

/**
 * Build topic/project context and possible reorganization suggestion for a single note.
 */
export function inferNoteKnowledgeContextFromNotes(notes: KnowledgeNote[], noteId: string): NoteKnowledgeContext | null {
  const targetNote = notes.find((note) => note.id === noteId);

  if (!targetNote) {
    return null;
  }

  const clusterMap = buildClusterMaps(notes);
  const noteSignals = [
    ...getProjectSignals(targetNote).map((label) => buildClusterId("project", label)),
    ...getTopicSignals(targetNote).map((label) => buildClusterId("topic", label)),
  ];

  const clusters = noteSignals
    .map((signalId) => clusterMap.get(signalId))
    .filter((cluster): cluster is ClusterAccumulator => Boolean(cluster))
    .map(toKnowledgeCluster)
    .filter((cluster) => cluster.noteCount >= 2)
    .sort((left, right) => right.noteCount - left.noteCount)
    .slice(0, 4);

  return {
    clusters,
    suggestion: inferProjectSuggestion(notes, targetNote),
  };
}

/** Rank reclassification candidates from an in-memory note set. */
export function inferReclassificationCandidatesFromNotes(
  notes: KnowledgeNote[],
  limit = 8
): ReclassificationCandidate[] {
  return notes
    .map((note) => {
      const context = inferNoteKnowledgeContextFromNotes(notes, note.id);
      const suggestion = context?.suggestion;
      if (!suggestion) {
        return null;
      }

      const sameProject = (note.suggestedProject || "").trim().toLowerCase() === (suggestion.suggestedProject || "").trim().toLowerCase();
      const sameCategory = (note.category || "").trim().toLowerCase() === (suggestion.suggestedCategory || "").trim().toLowerCase();

      if (sameProject && (sameCategory || !suggestion.suggestedCategory)) {
        return null;
      }

      const meta = parseNoteAiMeta(note.aiMeta);
      const latestSupportingChange = suggestion.supportingNotes.reduce<number>((latest, supportingNote) => {
        const createdAt = new Date(supportingNote.createdAt).getTime();
        return Math.max(latest, createdAt);
      }, 0);
      const changedByNewerContext = latestSupportingChange > note.updatedAt.getTime();

      return {
        note: toClusterNotePreview(note),
        currentProject: note.suggestedProject,
        currentCategory: note.category,
        suggestedProject: suggestion.suggestedProject,
        suggestedCategory: suggestion.suggestedCategory,
        reason: suggestion.reason,
        confidence: suggestion.confidence,
        basedOnTopics: suggestion.basedOnTopics,
        supportingNotes: suggestion.supportingNotes,
        changedByNewerContext,
        clarificationTurns: meta.clarificationHistory.length,
        sortScore:
          suggestion.confidence * 100 +
          (changedByNewerContext ? 15 : 0) +
          meta.clarificationHistory.length * 5 +
          suggestion.supportingNotes.length * 4 +
          (note.confidenceScore !== null && note.confidenceScore !== undefined ? (1 - note.confidenceScore) * 10 : 0),
      };
    })
    .filter((candidate): candidate is ReclassificationCandidate & { sortScore: number } => Boolean(candidate))
    .sort((left, right) => right.sortScore - left.sortScore)
    .slice(0, limit)
    .map((candidateWithScore) => {
      const candidate = { ...candidateWithScore } as ReclassificationCandidate & { sortScore?: number };
      delete candidate.sortScore;
      return candidate as ReclassificationCandidate;
    });
}

/** Read persisted reclassification snapshots from note aiMeta without recomputing the full graph. */
export function getPersistedReclassificationCandidatesFromNotes(
  notes: KnowledgeNote[],
  limit = 8
): ReclassificationCandidate[] {
  return notes
    .map((note) => {
      const aiMeta = getAiMetaRecord(note.aiMeta);
      const persisted = parsePersistedReclassificationSuggestion(aiMeta.reclassificationSuggestion);
      if (!persisted) {
        return null;
      }

      return {
        note: toClusterNotePreview(note),
        currentProject: persisted.currentProject,
        currentCategory: persisted.currentCategory,
        suggestedProject: persisted.suggestedProject,
        suggestedCategory: persisted.suggestedCategory,
        reason: persisted.reason,
        confidence: persisted.confidence,
        basedOnTopics: persisted.basedOnTopics,
        supportingNotes: persisted.supportingNotes,
        changedByNewerContext: persisted.changedByNewerContext,
        clarificationTurns: persisted.clarificationTurns,
        queuedAt: persisted.queuedAt,
      };
    })
    .filter((candidate): candidate is ReclassificationCandidate & { queuedAt: string } => Boolean(candidate))
    .sort((left, right) => {
      const scoreDelta = right.confidence - left.confidence;
      if (scoreDelta !== 0) {
        return scoreDelta;
      }

      return new Date(right.queuedAt).getTime() - new Date(left.queuedAt).getTime();
    })
    .slice(0, limit)
    .map((candidateWithQueuedAt) => {
      const candidate = { ...candidateWithQueuedAt } as ReclassificationCandidate & { queuedAt?: string };
      delete candidate.queuedAt;
      return candidate as ReclassificationCandidate;
    });
}

/**
 * Infer browsable knowledge clusters from existing notes, entities, and project signals.
 */
export async function getUserKnowledgeClusters(
  userId: string,
  options?: { kind?: "project" | "topic" }
): Promise<KnowledgeCluster[]> {
  const notes = await loadKnowledgeNotes(userId);
  return inferKnowledgeClustersFromNotes(notes, options);
}

/**
 * Load note corpus and build cluster context for a single note.
 */
export async function getNoteKnowledgeContext(userId: string, noteId: string): Promise<NoteKnowledgeContext | null> {
  const notes = await loadKnowledgeNotes(userId);
  return inferNoteKnowledgeContextFromNotes(notes, noteId);
}

/**
 * Load note corpus and compute ranked reclassification suggestions for notes whose context likely changed.
 */
export async function getUserReclassificationCandidates(
  userId: string,
  limit = 8
): Promise<ReclassificationCandidate[]> {
  const notes = await loadKnowledgeNotes(userId);
  const persisted = getPersistedReclassificationCandidatesFromNotes(notes, limit);
  if (persisted.length > 0) {
    return persisted;
  }

  return inferReclassificationCandidatesFromNotes(notes, limit);
}

/**
 * Recompute and persist changed-meaning suggestions after enrichment or major note reorganization.
 * Uses raw SQL for aiMeta writes so note updatedAt does not change purely from queue bookkeeping.
 */
export async function rescoreUserReclassificationQueue(userId: string): Promise<void> {
  const notes = await loadKnowledgeNotes(userId);
  const candidates = inferReclassificationCandidatesFromNotes(notes, notes.length);
  const candidateMap = new Map(candidates.map((candidate) => [candidate.note.id, candidate]));
  const now = new Date().toISOString();

  for (const note of notes) {
    const existingAiMeta = getAiMetaRecord(note.aiMeta);
    const existingSuggestion = parsePersistedReclassificationSuggestion(existingAiMeta.reclassificationSuggestion);
    const candidate = candidateMap.get(note.id) || null;

    if (isSameReclassificationSuggestion(existingSuggestion, candidate)) {
      continue;
    }

    const nextAiMeta = { ...existingAiMeta } as Record<string, unknown>;

    if (!candidate) {
      delete nextAiMeta.reclassificationSuggestion;
    } else {
      nextAiMeta.reclassificationSuggestion = toPersistedReclassificationSuggestion(
        candidate,
        existingSuggestion?.queuedAt || now
      );
    }

    await prisma.$executeRaw(
      Prisma.sql`UPDATE "Note" SET "aiMeta" = ${JSON.stringify(nextAiMeta)}::jsonb WHERE "id" = ${note.id}`
    );
  }
}
