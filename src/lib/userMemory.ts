import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

interface MemoryItem {
  name: string;
  count: number;
  lastSeen: string;
}

interface HintStat {
  hint: string;
  kind: "project" | "context";
  uses: number;
  totalConfidenceLift: number;
  lastUsed: string;
}

export type ReviewSuppressionKind = "forgotten-note" | "pattern";

interface ReviewSuppression {
  id: string;
  until: string;
  label?: string;
}

export interface ReviewState {
  forgottenNotes: ReviewSuppression[];
  patterns: ReviewSuppression[];
}

interface ThinkingMemory {
  knownProjects: MemoryItem[];
  knownContexts: MemoryItem[];
  knownPeople: MemoryItem[];
  knownTopics: MemoryItem[];
  hintStats: HintStat[];
  reviewState: ReviewState;
}

export type { HintStat };

export interface ThinkingMemoryHints {
  projects: string[];
  contexts: string[];
}

interface OrganizedLike {
  suggestedProject?: string | null;
  extractedEntities?: Array<{ type: string; name: string }>;
}

interface UpdateThinkingMemoryOptions {
  explicitProject?: string;
  explicitContext?: string;
  organized: OrganizedLike;
}

const MAX_ITEMS_PER_BUCKET = 20;
const MAX_REVIEW_SUPPRESSIONS_PER_KIND = 100;

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function coerceMemoryItem(value: unknown): MemoryItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const name = typeof value.name === "string" ? normalizeName(value.name) : "";
  if (!name) {
    return null;
  }

  const count = typeof value.count === "number" && Number.isFinite(value.count)
    ? Math.max(1, Math.floor(value.count))
    : 1;
  const lastSeen = typeof value.lastSeen === "string" && value.lastSeen
    ? value.lastSeen
    : new Date().toISOString();

  return { name, count, lastSeen };
}

function parseMemoryBucket(value: unknown): MemoryItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(coerceMemoryItem)
    .filter((item): item is MemoryItem => item !== null)
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_ITEMS_PER_BUCKET);
}

function emptyMemory(): ThinkingMemory {
  return {
    knownProjects: [],
    knownContexts: [],
    knownPeople: [],
    knownTopics: [],
    hintStats: [],
    reviewState: {
      forgottenNotes: [],
      patterns: [],
    },
  };
}

function parseHintStats(value: unknown): HintStat[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is HintStat => {
    if (!isRecord(item)) return false;
    return (
      typeof item.hint === "string" &&
      (item.kind === "project" || item.kind === "context") &&
      typeof item.uses === "number" &&
      typeof item.totalConfidenceLift === "number" &&
      typeof item.lastUsed === "string"
    );
  });
}

function parseReviewSuppressions(value: unknown): ReviewSuppression[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is ReviewSuppression => {
      if (!isRecord(item)) {
        return false;
      }

      return (
        typeof item.id === "string" &&
        item.id.trim().length > 0 &&
        typeof item.until === "string" &&
        item.until.length > 0 &&
        (item.label === undefined || typeof item.label === "string")
      );
    })
    .slice(0, MAX_REVIEW_SUPPRESSIONS_PER_KIND);
}

function parseReviewState(value: unknown): ReviewState {
  if (!isRecord(value)) {
    return {
      forgottenNotes: [],
      patterns: [],
    };
  }

  return {
    forgottenNotes: parseReviewSuppressions(value.forgottenNotes),
    patterns: parseReviewSuppressions(value.patterns),
  };
}

function pruneReviewSuppressions(items: ReviewSuppression[], now = new Date()): ReviewSuppression[] {
  return items
    .filter((item) => {
      const until = new Date(item.until);
      return !Number.isNaN(until.getTime()) && until.getTime() > now.getTime();
    })
    .slice(0, MAX_REVIEW_SUPPRESSIONS_PER_KIND);
}

function pruneReviewState(reviewState: ReviewState, now = new Date()): ReviewState {
  return {
    forgottenNotes: pruneReviewSuppressions(reviewState.forgottenNotes, now),
    patterns: pruneReviewSuppressions(reviewState.patterns, now),
  };
}

async function persistThinkingMemory(userId: string, memory: ThinkingMemory): Promise<void> {
  const reviewState = pruneReviewState(memory.reviewState);

  await prisma.userPreferences.upsert({
    where: { userId },
    create: {
      userId,
      thinkingMemory: {
        knownProjects: memory.knownProjects,
        knownContexts: memory.knownContexts,
        knownPeople: memory.knownPeople,
        knownTopics: memory.knownTopics,
        hintStats: memory.hintStats,
        reviewState,
      } as unknown as Prisma.InputJsonValue,
    },
    update: {
      thinkingMemory: {
        knownProjects: memory.knownProjects,
        knownContexts: memory.knownContexts,
        knownPeople: memory.knownPeople,
        knownTopics: memory.knownTopics,
        hintStats: memory.hintStats,
        reviewState,
      } as unknown as Prisma.InputJsonValue,
    },
  });
}

/**
 * Load and normalize the current user thinking-memory profile.
 */
export async function getThinkingMemory(userId: string): Promise<ThinkingMemory> {
  const preferences = await prisma.userPreferences.findUnique({
    where: { userId },
    select: { thinkingMemory: true },
  });

  const raw = preferences?.thinkingMemory;
  if (!isRecord(raw)) {
    return emptyMemory();
  }

  return {
    knownProjects: parseMemoryBucket(raw.knownProjects),
    knownContexts: parseMemoryBucket(raw.knownContexts),
    knownPeople: parseMemoryBucket(raw.knownPeople),
    knownTopics: parseMemoryBucket(raw.knownTopics),
    hintStats: parseHintStats(raw.hintStats),
    reviewState: pruneReviewState(parseReviewState(raw.reviewState)),
  };
}

function upsertMemoryItem(items: MemoryItem[], rawName: string): MemoryItem[] {
  const name = normalizeName(rawName);
  if (!name) {
    return items;
  }

  const now = new Date().toISOString();
  const existingIndex = items.findIndex(
    (item) => item.name.toLowerCase() === name.toLowerCase()
  );

  if (existingIndex === -1) {
    const next = [{ name, count: 1, lastSeen: now }, ...items];
    return next
      .sort((a, b) => b.count - a.count)
      .slice(0, MAX_ITEMS_PER_BUCKET);
  }

  const next = [...items];
  const existing = next[existingIndex];
  next[existingIndex] = {
    ...existing,
    count: existing.count + 1,
    lastSeen: now,
  };

  return next
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_ITEMS_PER_BUCKET);
}

/**
 * Build a compact user profile string to condition AI note organization.
 */
export function buildThinkingMemoryPrompt(memory: ThinkingMemory): string {
  const formatBucket = (label: string, items: MemoryItem[]): string => {
    if (items.length === 0) {
      return `${label}: (none)`;
    }

    const formatted = items
      .slice(0, 8)
      .map((item) => `${item.name} (${item.count})`)
      .join(", ");

    return `${label}: ${formatted}`;
  };

  return [
    formatBucket("Known projects", memory.knownProjects),
    formatBucket("Known contexts", memory.knownContexts),
    formatBucket("Frequent people", memory.knownPeople),
    formatBucket("Frequent topics", memory.knownTopics),
  ].join("\n");
}

/**
 * Build compact hint lists for UI clarification chips.
 */
export function getThinkingMemoryHints(memory: ThinkingMemory): ThinkingMemoryHints {
  return {
    projects: memory.knownProjects.slice(0, 4).map((item) => item.name),
    contexts: memory.knownContexts.slice(0, 4).map((item) => item.name),
  };
}

/**
 * Update persistent user thinking-memory with project/context/entity signals from a note.
 */
export async function updateThinkingMemory(
  userId: string,
  options: UpdateThinkingMemoryOptions
): Promise<void> {
  const current = await getThinkingMemory(userId);

  let knownProjects = [...current.knownProjects];
  let knownContexts = [...current.knownContexts];
  let knownPeople = [...current.knownPeople];
  let knownTopics = [...current.knownTopics];

  if (options.explicitProject) {
    knownProjects = upsertMemoryItem(knownProjects, options.explicitProject);
  }

  if (options.organized.suggestedProject) {
    knownProjects = upsertMemoryItem(knownProjects, options.organized.suggestedProject);
  }

  if (options.explicitContext) {
    knownContexts = upsertMemoryItem(knownContexts, options.explicitContext);
  }

  for (const entity of options.organized.extractedEntities || []) {
    if (!entity?.name) {
      continue;
    }

    const entityType = (entity.type || "").toUpperCase();
    if (entityType === "PROJECT") {
      knownProjects = upsertMemoryItem(knownProjects, entity.name);
    } else if (entityType === "PERSON") {
      knownPeople = upsertMemoryItem(knownPeople, entity.name);
    } else if (entityType === "TOPIC" || entityType === "APP" || entityType === "COMPANY") {
      knownTopics = upsertMemoryItem(knownTopics, entity.name);
    }
  }

  const hintStats = [...current.hintStats];

  await persistThinkingMemory(userId, {
    knownProjects,
    knownContexts,
    knownPeople,
    knownTopics,
    hintStats,
    reviewState: current.reviewState,
  });
}

/**
 * Record the confidence lift produced by a clarification hint click.
 */
export async function recordHintUsage(
  userId: string,
  hint: string,
  kind: "project" | "context",
  confidenceBefore: number,
  confidenceAfter: number
): Promise<void> {
  const current = await getThinkingMemory(userId);
  const lift = confidenceAfter - confidenceBefore;
  const now = new Date().toISOString();
  const stats = [...current.hintStats];

  const existingIndex = stats.findIndex(
    (s) => s.hint.toLowerCase() === hint.toLowerCase() && s.kind === kind
  );

  if (existingIndex === -1) {
    stats.push({ hint, kind, uses: 1, totalConfidenceLift: lift, lastUsed: now });
  } else {
    const existing = stats[existingIndex];
    stats[existingIndex] = {
      ...existing,
      uses: existing.uses + 1,
      totalConfidenceLift: existing.totalConfidenceLift + lift,
      lastUsed: now,
    };
  }

  // Keep top 50 most-used stats.
  stats.sort((a, b) => b.uses - a.uses);
  stats.splice(50);

  await persistThinkingMemory(userId, {
    ...current,
    hintStats: stats,
  });
}

/**
 * Return sorted hint stats for display in settings.
 */
export async function getHintStats(userId: string): Promise<HintStat[]> {
  const memory = await getThinkingMemory(userId);
  return memory.hintStats
    .filter((s) => s.uses > 0)
    .sort((a, b) => b.uses - a.uses);
}

/** Return whether a review item is currently suppressed. */
export function isReviewItemSuppressed(
  reviewState: ReviewState,
  kind: ReviewSuppressionKind,
  id: string,
  now = new Date()
): boolean {
  const items = kind === "forgotten-note" ? reviewState.forgottenNotes : reviewState.patterns;

  return items.some((item) => {
    if (item.id !== id) {
      return false;
    }

    const until = new Date(item.until);
    return !Number.isNaN(until.getTime()) && until.getTime() > now.getTime();
  });
}

/**
 * Persist a review-item suppression window so snoozed or dismissed items stay out of the queue.
 */
export async function suppressReviewItem(
  userId: string,
  kind: ReviewSuppressionKind,
  id: string,
  durationDays: number,
  label?: string
): Promise<string> {
  const current = await getThinkingMemory(userId);
  const until = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();
  const reviewState = pruneReviewState(current.reviewState);
  const key = kind === "forgotten-note" ? "forgottenNotes" : "patterns";
  const nextItems = reviewState[key]
    .filter((item) => item.id !== id)
    .concat({ id, until, ...(label ? { label } : {}) })
    .slice(0, MAX_REVIEW_SUPPRESSIONS_PER_KIND);

  await persistThinkingMemory(userId, {
    ...current,
    reviewState: {
      ...reviewState,
      [key]: nextItems,
    },
  });

  return until;
}

/** Remove a persisted review-item suppression so it can reappear immediately. */
export async function restoreReviewItem(
  userId: string,
  kind: ReviewSuppressionKind,
  id: string
): Promise<void> {
  const current = await getThinkingMemory(userId);
  const reviewState = pruneReviewState(current.reviewState);
  const key = kind === "forgotten-note" ? "forgottenNotes" : "patterns";

  await persistThinkingMemory(userId, {
    ...current,
    reviewState: {
      ...reviewState,
      [key]: reviewState[key].filter((item) => item.id !== id),
    },
  });
}
