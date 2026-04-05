import { prisma } from "@/lib/db";
import { getReviewActionStats, type ReviewActionStat } from "@/lib/userMemory";
import {
  buildReviewActionKey,
  buildReviewActionStatMap,
  getReviewNoiseAssessment,
} from "@/lib/reviewFeedback";

type ResurfacingEntityType = "PROJECT" | "APP" | "TOPIC" | "COMPANY" | "PERSON" | "PLACE";

type ReviewPatternKind = "project" | "topic" | "idea";

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
  kind: ReviewPatternKind;
  noteCount: number;
  reason: string;
  lastSeenAt: string;
  supportingNotes: ReviewNotePreview[];
}

interface PatternAccumulator {
  id: string;
  label: string;
  kind: Exclude<ReviewPatternKind, "idea">;
  noteIds: Set<string>;
  supportingNotes: ResurfacingNoteInput[];
  lastSeenAt: number;
}

interface IdeaCluster {
  notes: ResurfacingNoteInput[];
  tokens: string[];
  lastSeenAt: number;
}

interface ScoredIdeaPatternEntry {
  pattern: ReviewPatternCandidate & { kind: "idea" };
  score: number;
  lastSeenAt: number;
}

const IDEA_STOPWORDS = new Set([
  "about",
  "again",
  "around",
  "because",
  "being",
  "draft",
  "from",
  "into",
  "just",
  "meeting",
  "meetings",
  "need",
  "needs",
  "note",
  "notes",
  "project",
  "projects",
  "review",
  "reviews",
  "should",
  "something",
  "stuff",
  "task",
  "tasks",
  "that",
  "their",
  "them",
  "thing",
  "things",
  "this",
  "update",
  "updates",
  "with",
  "work",
]);

function normalizeSignal(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeIdeaToken(token: string): string {
  let normalized = token.toLowerCase().replace(/[^a-z0-9]/g, "");

  if (!normalized || normalized.length < 4 || /^\d+$/.test(normalized) || IDEA_STOPWORDS.has(normalized)) {
    return "";
  }

  if (normalized.endsWith("ies") && normalized.length > 5) {
    normalized = `${normalized.slice(0, -3)}y`;
  } else if (normalized.endsWith("ing") && normalized.length > 6) {
    normalized = normalized.slice(0, -3);
  } else if (normalized.endsWith("ed") && normalized.length > 5) {
    normalized = normalized.slice(0, -2);
  } else if (normalized.endsWith("s") && normalized.length > 5 && !normalized.endsWith("ss")) {
    normalized = normalized.slice(0, -1);
  }

  return IDEA_STOPWORDS.has(normalized) || normalized.length < 4 ? "" : normalized;
}

function formatIdeaLabel(token: string): string {
  return token.charAt(0).toUpperCase() + token.slice(1);
}

function getIdeaTokens(note: ResurfacingNoteInput): string[] {
  const sourceText = [note.title || "", note.summary || "", note.rawContent.slice(0, 240)].join(" ");
  const seen = new Set<string>();
  const tokens: string[] = [];

  for (const fragment of sourceText.split(/[^a-zA-Z0-9]+/)) {
    const normalized = normalizeIdeaToken(fragment);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    tokens.push(normalized);

    if (tokens.length >= 16) {
      break;
    }
  }

  return tokens;
}

function countSharedTokens(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) {
    return 0;
  }

  const rightSet = new Set(right);
  return left.filter((token) => rightSet.has(token)).length;
}

function buildIdeaLabel(notes: ResurfacingNoteInput[]): string | null {
  const tokenCounts = new Map<string, number>();

  for (const note of notes) {
    for (const token of getIdeaTokens(note)) {
      tokenCounts.set(token, (tokenCounts.get(token) || 0) + 1);
    }
  }

  const dominantTokens = [...tokenCounts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 3)
    .map(([token]) => formatIdeaLabel(token));

  if (dominantTokens.length === 0) {
    return null;
  }

  return dominantTokens.join(" ");
}

function isIdeaClusterCoveredByExplicitSignals(notes: ResurfacingNoteInput[]): boolean {
  const explicitCounts = new Map<string, number>();

  for (const note of notes) {
    const explicitSignals = new Set([...getProjectSignals(note), ...getTopicSignals(note)]);
    for (const signal of explicitSignals) {
      explicitCounts.set(signal.toLowerCase(), (explicitCounts.get(signal.toLowerCase()) || 0) + 1);
    }
  }

  return [...explicitCounts.values()].some((count) => count >= notes.length);
}

function buildRecurringIdeaClusters(
  notes: ResurfacingNoteInput[],
  recentWindowStart: Date
): IdeaCluster[] {
  const recentNotes = notes.filter((note) => note.createdAt >= recentWindowStart || note.updatedAt >= recentWindowStart);
  const tokenized = recentNotes
    .map((note) => ({ note, tokens: getIdeaTokens(note) }))
    .filter((entry) => entry.tokens.length >= 2);

  if (tokenized.length < 3) {
    return [];
  }

  const parent = tokenized.map((_, index) => index);

  const find = (index: number): number => {
    if (parent[index] !== index) {
      parent[index] = find(parent[index]);
    }

    return parent[index];
  };

  const union = (leftIndex: number, rightIndex: number) => {
    const leftRoot = find(leftIndex);
    const rightRoot = find(rightIndex);

    if (leftRoot !== rightRoot) {
      parent[rightRoot] = leftRoot;
    }
  };

  for (let leftIndex = 0; leftIndex < tokenized.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < tokenized.length; rightIndex += 1) {
      const sharedTokenCount = countSharedTokens(tokenized[leftIndex].tokens, tokenized[rightIndex].tokens);
      const unionSize = new Set([...tokenized[leftIndex].tokens, ...tokenized[rightIndex].tokens]).size || 1;
      const similarity = sharedTokenCount / unionSize;

      if (sharedTokenCount >= 2 && similarity >= 0.14) {
        union(leftIndex, rightIndex);
      }
    }
  }

  const groups = new Map<number, Array<{ note: ResurfacingNoteInput; tokens: string[] }>>();

  tokenized.forEach((entry, index) => {
    const root = find(index);
    const current = groups.get(root) || [];
    current.push(entry);
    groups.set(root, current);
  });

  return [...groups.values()]
    .filter((group) => group.length >= 3)
    .map((group) => {
      const notesInCluster = group.map((entry) => entry.note);
      const tokens = buildIdeaLabel(notesInCluster)?.split(" ").map((token) => token.toLowerCase()) || [];

      return {
        notes: notesInCluster,
        tokens,
        lastSeenAt: Math.max(...notesInCluster.map((note) => note.updatedAt.getTime())),
      };
    })
    .filter((cluster) => cluster.tokens.length > 0 && !isIdeaClusterCoveredByExplicitSignals(cluster.notes));
}

function scorePattern(noteCount: number, lastSeenAt: number, recentWindowStart: Date, noisePenalty: number, kind: ReviewPatternKind): number {
  const recencyBoost = Math.max(0, (lastSeenAt - recentWindowStart.getTime()) / (24 * 60 * 60 * 1000));
  const weight = kind === "idea" ? 16 : 20;
  return noteCount * weight + recencyBoost - noisePenalty;
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

  const explicitPatterns = [...patterns.values()]
    .filter((pattern) => pattern.noteIds.size >= 3)
    .map((pattern) => {
      const noise = getReviewNoiseAssessment(actionStatMap.get(buildReviewActionKey("pattern", pattern.id)));
      if (noise.level === "suppressed") {
        return null;
      }

      const score = scorePattern(pattern.noteIds.size, pattern.lastSeenAt, recentWindowStart, noise.penalty, pattern.kind);
      if (score <= 0) {
        return null;
      }

      return {
        pattern,
        score,
      };
    })
    .filter((entry): entry is { pattern: PatternAccumulator; score: number } => Boolean(entry));

  const recurringIdeaPatterns = buildRecurringIdeaClusters(notes, recentWindowStart)
    .map((cluster) => {
      const label = cluster.tokens.map(formatIdeaLabel).join(" ");
      const id = `idea:${label.toLowerCase()}`;
      const noise = getReviewNoiseAssessment(actionStatMap.get(buildReviewActionKey("pattern", id)));

      if (noise.level === "suppressed") {
        return null;
      }

      const score = scorePattern(cluster.notes.length, cluster.lastSeenAt, recentWindowStart, noise.penalty, "idea");
      if (score <= 0) {
        return null;
      }

      return {
        pattern: {
          id,
          label,
          kind: "idea" as const,
          noteCount: cluster.notes.length,
          reason: `${cluster.notes.length} recent notes keep circling back to the same idea thread around ${label}.`,
          lastSeenAt: new Date(cluster.lastSeenAt).toISOString(),
          supportingNotes: cluster.notes
            .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())
            .slice(0, 4)
            .map(toPreview),
        },
        score,
        lastSeenAt: cluster.lastSeenAt,
      };
    })
    .filter((entry): entry is ScoredIdeaPatternEntry => entry !== null);

  return [
    ...explicitPatterns.map(({ pattern, score }) => ({
      pattern: {
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
      },
      score,
      lastSeenAt: pattern.lastSeenAt,
    })),
    ...recurringIdeaPatterns,
  ]
    .sort((left, right) => right.score - left.score || right.lastSeenAt - left.lastSeenAt)
    .slice(0, limit)
    .map(({ pattern }) => pattern);
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