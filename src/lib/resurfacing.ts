import { prisma } from "@/lib/db";
import { getReviewActionStats, type ReviewActionStat } from "@/lib/userMemory";
import {
  buildReviewActionKey,
  buildReviewActionStatMap,
  getReviewNoiseAssessment,
} from "@/lib/reviewFeedback";

type ResurfacingEntityType = "PROJECT" | "APP" | "TOPIC" | "COMPANY" | "PERSON" | "PLACE";

interface ResurfacingNoteEntity {
  entity: {
    id: string;
    name: string;
    type: ResurfacingEntityType;
  };
}

export interface ResurfacingNoteInput {
  id: string;
  title: string | null;
  summary: string | null;
  rawContent: string;
  createdAt: Date;
  updatedAt: Date;
  category: string | null;
  tags: string[];
  suggestedProject: string | null;
  priority: string | null;
  extractedTasks: unknown;
  isPinned: boolean;
  entities: ResurfacingNoteEntity[];
}

export interface ReviewNotePreview {
  id: string;
  title: string | null;
  summary: string | null;
  category: string | null;
  suggestedProject: string | null;
  createdAt: string;
}

export interface ForgottenNoteCandidate {
  note: ReviewNotePreview;
  ageDays: number;
  reason: string;
  overlapSignals: string[];
  extractedTaskCount: number;
  priority: string | null;
}

export interface ReviewPatternCandidate {
  id: string;
  label: string;
  kind: "project" | "topic";
  noteCount: number;
  reason: string;
  lastSeenAt: string;
  supportingNotes: ReviewNotePreview[];
}

interface PatternAccumulator {
  id: string;
  label: string;
  kind: "project" | "topic";
  noteIds: Set<string>;
  supportingNotes: ResurfacingNoteInput[];
  lastSeenAt: number;
}

function normalizeSignal(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function toPreview(note: ResurfacingNoteInput): ReviewNotePreview {
  return {
    id: note.id,
    title: note.title,
    summary: note.summary || note.rawContent.slice(0, 180),
    category: note.category,
    suggestedProject: note.suggestedProject,
    createdAt: note.createdAt.toISOString(),
  };
}

/** Count extracted tasks when the stored JSON payload is task-shaped. */
function getExtractedTaskCount(raw: unknown): number {
  if (!Array.isArray(raw)) {
    return 0;
  }

  return raw.filter((item) => {
    return !!item && typeof item === "object" && !Array.isArray(item) && typeof (item as { text?: unknown }).text === "string";
  }).length;
}

function getProjectSignals(note: ResurfacingNoteInput): string[] {
  const signals = new Set<string>();

  if (note.suggestedProject?.trim()) {
    signals.add(normalizeSignal(note.suggestedProject));
  }

  for (const entity of note.entities) {
    if (entity.entity.type === "PROJECT" || entity.entity.type === "APP") {
      signals.add(normalizeSignal(entity.entity.name));
    }
  }

  return [...signals];
}

function getTopicSignals(note: ResurfacingNoteInput): string[] {
  const signals = new Set<string>();

  for (const entity of note.entities) {
    if (entity.entity.type === "TOPIC" || entity.entity.type === "COMPANY") {
      signals.add(normalizeSignal(entity.entity.name));
    }
  }

  for (const tag of note.tags || []) {
    const normalizedTag = normalizeSignal(tag);
    if (normalizedTag) {
      signals.add(normalizedTag);
    }
  }

  return [...signals];
}

function buildReason(overlapSignals: string[], taskCount: number, priority: string | null): string {
  if (overlapSignals.length > 0) {
    return `Recent notes are circling back to ${overlapSignals.slice(0, 2).join(" and ")}.`;
  }

  if (taskCount > 0) {
    return `Still carries ${taskCount} extracted task${taskCount === 1 ? "" : "s"} without recent changes.`;
  }

  if (priority === "high") {
    return "Older high-priority note without recent changes.";
  }

  return "Older note that may be worth revisiting.";
}


/**
 * Infer forgotten-note candidates from an in-memory note corpus using age, stale updates, task count, and overlap with recent signals.
 */
export function inferForgottenNoteCandidatesFromNotes(
  notes: ResurfacingNoteInput[],
  options?: { now?: Date; limit?: number; ageDays?: number; recentWindowDays?: number; actionStats?: ReviewActionStat[] }
): ForgottenNoteCandidate[] {
  const now = options?.now || new Date();
  const limit = options?.limit ?? 6;
  const ageDays = options?.ageDays ?? 14;
  const recentWindowDays = options?.recentWindowDays ?? 14;
  const minAgeMs = ageDays * 24 * 60 * 60 * 1000;
  const recentWindowStart = new Date(now.getTime() - recentWindowDays * 24 * 60 * 60 * 1000);
  const actionStatMap = buildReviewActionStatMap(options?.actionStats);

  const recentSignalCounts = new Map<string, number>();
  for (const note of notes) {
    if (note.createdAt < recentWindowStart && note.updatedAt < recentWindowStart) {
      continue;
    }

    const noteSignals = new Set([...getProjectSignals(note), ...getTopicSignals(note)]);
    for (const signal of noteSignals) {
      recentSignalCounts.set(signal, (recentSignalCounts.get(signal) || 0) + 1);
    }
  }

  return notes
    .map((note) => {
      if (note.isPinned) {
        return null;
      }

      const ageMs = now.getTime() - note.createdAt.getTime();
      if (ageMs < minAgeMs) {
        return null;
      }

      const staleDays = (now.getTime() - note.updatedAt.getTime()) / (24 * 60 * 60 * 1000);
      const overlapSignals = [...new Set([...getProjectSignals(note), ...getTopicSignals(note)])]
        .filter((signal) => (recentSignalCounts.get(signal) || 0) > 0)
        .slice(0, 3);
      const taskCount = getExtractedTaskCount(note.extractedTasks);

      const isStale = staleDays >= 10;
      if (!isStale && overlapSignals.length === 0 && taskCount === 0 && note.priority !== "high") {
        return null;
      }

      const noise = getReviewNoiseAssessment(
        actionStatMap.get(buildReviewActionKey("forgotten-note", note.id))
      );
      if (noise.level === "suppressed") {
        return null;
      }

      const ageInDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));
      const score =
        ageInDays * 0.35 +
        overlapSignals.length * 18 +
        taskCount * 6 +
        (note.priority === "high" ? 10 : 0) +
        (isStale ? 8 : 0) -
        noise.penalty;

      if (score <= 0) {
        return null;
      }

      return {
        note: toPreview(note),
        ageDays: ageInDays,
        reason: buildReason(overlapSignals, taskCount, note.priority),
        overlapSignals,
        extractedTaskCount: taskCount,
        priority: note.priority,
        score,
      };
    })
    .filter((candidate): candidate is ForgottenNoteCandidate & { score: number } => Boolean(candidate))
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((candidateWithScore) => {
      const candidate = { ...candidateWithScore } as ForgottenNoteCandidate & { score?: number };
      delete candidate.score;
      return candidate as ForgottenNoteCandidate;
    });
}

/**
 * Infer repeated-pattern review cards from recent note signals so recurring themes are visible in one place.
 */
export function inferReviewPatternsFromNotes(
  notes: ResurfacingNoteInput[],
  options?: { now?: Date; limit?: number; recentWindowDays?: number; actionStats?: ReviewActionStat[] }
): ReviewPatternCandidate[] {
  const now = options?.now || new Date();
  const limit = options?.limit ?? 6;
  const recentWindowDays = options?.recentWindowDays ?? 14;
  const recentWindowStart = new Date(now.getTime() - recentWindowDays * 24 * 60 * 60 * 1000);
  const actionStatMap = buildReviewActionStatMap(options?.actionStats);

  const patterns = new Map<string, PatternAccumulator>();

  for (const note of notes) {
    if (note.createdAt < recentWindowStart && note.updatedAt < recentWindowStart) {
      continue;
    }

    const noteProjects = getProjectSignals(note);
    const noteTopics = getTopicSignals(note);

    for (const label of noteProjects) {
      const id = `project:${label.toLowerCase()}`;
      const current = patterns.get(id) || {
        id,
        label,
        kind: "project" as const,
        noteIds: new Set<string>(),
        supportingNotes: [],
        lastSeenAt: 0,
      };
      current.noteIds.add(note.id);
      if (!current.supportingNotes.some((support) => support.id === note.id)) {
        current.supportingNotes.push(note);
      }
      current.lastSeenAt = Math.max(current.lastSeenAt, note.updatedAt.getTime());
      patterns.set(id, current);
    }

    for (const label of noteTopics) {
      const id = `topic:${label.toLowerCase()}`;
      const current = patterns.get(id) || {
        id,
        label,
        kind: "topic" as const,
        noteIds: new Set<string>(),
        supportingNotes: [],
        lastSeenAt: 0,
      };
      current.noteIds.add(note.id);
      if (!current.supportingNotes.some((support) => support.id === note.id)) {
        current.supportingNotes.push(note);
      }
      current.lastSeenAt = Math.max(current.lastSeenAt, note.updatedAt.getTime());
      patterns.set(id, current);
    }
  }

  return [...patterns.values()]
    .filter((pattern) => pattern.noteIds.size >= 3)
    .map((pattern) => {
      const noise = getReviewNoiseAssessment(actionStatMap.get(buildReviewActionKey("pattern", pattern.id)));
      if (noise.level === "suppressed") {
        return null;
      }

      const recencyBoost = Math.max(0, (pattern.lastSeenAt - recentWindowStart.getTime()) / (24 * 60 * 60 * 1000));
      const score = pattern.noteIds.size * 20 + recencyBoost - noise.penalty;
      if (score <= 0) {
        return null;
      }

      return {
        pattern,
        score,
      };
    })
    .filter((entry): entry is { pattern: PatternAccumulator; score: number } => Boolean(entry))
    .sort((left, right) => right.score - left.score || right.pattern.lastSeenAt - left.pattern.lastSeenAt)
    .slice(0, limit)
    .map(({ pattern }) => ({
      id: pattern.id,
      label: pattern.label,
      kind: pattern.kind,
      noteCount: pattern.noteIds.size,
      reason: `${pattern.noteIds.size} notes in the last ${recentWindowDays} days are circling around ${pattern.label}.`,
      lastSeenAt: new Date(pattern.lastSeenAt).toISOString(),
      supportingNotes: pattern.supportingNotes
        .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())
        .slice(0, 4)
        .map(toPreview),
    }));
}

async function loadResurfacingNotes(userId: string): Promise<ResurfacingNoteInput[]> {
  return prisma.note.findMany({
    where: {
      userId,
      isArchived: false,
      status: "PROCESSED",
    },
    orderBy: {
      updatedAt: "desc",
    },
    take: 500,
    select: {
      id: true,
      title: true,
      summary: true,
      rawContent: true,
      createdAt: true,
      updatedAt: true,
      category: true,
      tags: true,
      suggestedProject: true,
      priority: true,
      extractedTasks: true,
      isPinned: true,
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

/** Load forgotten-note resurfacing candidates for a user. */
export async function getUserForgottenNoteCandidates(userId: string, limit = 6): Promise<ForgottenNoteCandidate[]> {
  const [notes, actionStats] = await Promise.all([
    loadResurfacingNotes(userId),
    getReviewActionStats(userId),
  ]);

  return inferForgottenNoteCandidatesFromNotes(notes, { limit, actionStats });
}

/** Load repeated-pattern review cards for a user. */
export async function getUserReviewPatterns(userId: string, limit = 6): Promise<ReviewPatternCandidate[]> {
  const [notes, actionStats] = await Promise.all([
    loadResurfacingNotes(userId),
    getReviewActionStats(userId),
  ]);

  return inferReviewPatternsFromNotes(notes, { limit, actionStats });
}