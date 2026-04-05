import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import {
  buildClarificationQuestionKey,
  type ClarificationFeedbackAction,
  type ClarificationQuestionStat,
} from "@/lib/clarification";

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

export type ReviewSuppressionKind = "forgotten-note" | "pattern" | "reclassification";
export type ReviewActionType = "snooze" | "dismiss" | "restore";

interface ReviewSuppression {
  id: string;
  until: string;
  label?: string;
}

export interface ReviewActionStat {
  id: string;
  kind: ReviewSuppressionKind;
  label?: string;
  snoozes: number;
  dismisses: number;
  restores: number;
  lastAction: ReviewActionType;
  lastActionAt: string;
}

export interface ClarificationQuestionEvent {
  key: string;
  label: string;
  action: ClarificationFeedbackAction;
  createdAt: string;
}

export interface ReviewState {
  forgottenNotes: ReviewSuppression[];
  patterns: ReviewSuppression[];
  reclassifications: ReviewSuppression[];
}

interface ThinkingMemory {
  knownProjects: MemoryItem[];
  knownContexts: MemoryItem[];
  knownPeople: MemoryItem[];
  knownTopics: MemoryItem[];
  hintStats: HintStat[];
  reviewState: ReviewState;
  reviewActionStats: ReviewActionStat[];
  clarificationQuestionStats: ClarificationQuestionStat[];
  clarificationQuestionEvents: ClarificationQuestionEvent[];
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
const MAX_REVIEW_ACTION_STATS = 200;
const MAX_CLARIFICATION_QUESTION_STATS = 100;
const MAX_CLARIFICATION_QUESTION_EVENTS = 500;

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
      reclassifications: [],
    },
    reviewActionStats: [],
    clarificationQuestionStats: [],
    clarificationQuestionEvents: [],
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
      reclassifications: [],
    };
  }

  return {
    forgottenNotes: parseReviewSuppressions(value.forgottenNotes),
    patterns: parseReviewSuppressions(value.patterns),
    reclassifications: parseReviewSuppressions(value.reclassifications),
  };
}

function parseReviewActionStats(value: unknown): ReviewActionStat[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is ReviewActionStat => {
      if (!isRecord(item)) {
        return false;
      }

      return (
        typeof item.id === "string" &&
        item.id.trim().length > 0 &&
        (item.kind === "forgotten-note" || item.kind === "pattern" || item.kind === "reclassification") &&
        (item.label === undefined || typeof item.label === "string") &&
        typeof item.snoozes === "number" &&
        typeof item.dismisses === "number" &&
        typeof item.restores === "number" &&
        (item.lastAction === "snooze" || item.lastAction === "dismiss" || item.lastAction === "restore") &&
        typeof item.lastActionAt === "string"
      );
    })
    .slice(0, MAX_REVIEW_ACTION_STATS);
}

function parseClarificationQuestionStats(value: unknown): ClarificationQuestionStat[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is ClarificationQuestionStat => {
      if (!isRecord(item)) {
        return false;
      }

      return (
        typeof item.key === "string" &&
        item.key.trim().length > 0 &&
        typeof item.label === "string" &&
        item.label.trim().length > 0 &&
        typeof item.answers === "number" &&
        typeof item.dismisses === "number" &&
        typeof item.restores === "number" &&
        (item.lastAction === "answered" || item.lastAction === "dismissed" || item.lastAction === "restored") &&
        typeof item.lastActionAt === "string"
      );
    })
    .slice(0, MAX_CLARIFICATION_QUESTION_STATS);
}

function parseClarificationQuestionEvents(value: unknown): ClarificationQuestionEvent[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is ClarificationQuestionEvent => {
      if (!isRecord(item)) {
        return false;
      }

      return (
        typeof item.key === "string" &&
        item.key.trim().length > 0 &&
        typeof item.label === "string" &&
        item.label.trim().length > 0 &&
        (item.action === "answered" || item.action === "dismissed" || item.action === "restored") &&
        typeof item.createdAt === "string"
      );
    })
    .slice(0, MAX_CLARIFICATION_QUESTION_EVENTS);
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
    reclassifications: pruneReviewSuppressions(reviewState.reclassifications, now),
  };
}

function getReviewStateKey(kind: ReviewSuppressionKind): keyof ReviewState {
  if (kind === "forgotten-note") {
    return "forgottenNotes";
  }

  if (kind === "pattern") {
    return "patterns";
  }

  return "reclassifications";
}

function sortReviewActionStats(stats: ReviewActionStat[]): ReviewActionStat[] {
  return [...stats]
    .sort((left, right) => {
      const rightScore = right.dismisses * 3 + right.snoozes * 2 + right.restores;
      const leftScore = left.dismisses * 3 + left.snoozes * 2 + left.restores;
      return rightScore - leftScore || new Date(right.lastActionAt).getTime() - new Date(left.lastActionAt).getTime();
    })
    .slice(0, MAX_REVIEW_ACTION_STATS);
}

function sortClarificationQuestionStats(stats: ClarificationQuestionStat[]): ClarificationQuestionStat[] {
  return [...stats]
    .sort((left, right) => {
      const rightScore = right.dismisses * 3 + right.restores * 2 + right.answers;
      const leftScore = left.dismisses * 3 + left.restores * 2 + left.answers;
      return rightScore - leftScore || new Date(right.lastActionAt).getTime() - new Date(left.lastActionAt).getTime();
    })
    .slice(0, MAX_CLARIFICATION_QUESTION_STATS);
}

function sortClarificationQuestionEvents(events: ClarificationQuestionEvent[]): ClarificationQuestionEvent[] {
  return [...events]
    .filter((event) => !Number.isNaN(new Date(event.createdAt).getTime()))
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, MAX_CLARIFICATION_QUESTION_EVENTS);
}

function upsertReviewActionStat(
  stats: ReviewActionStat[],
  kind: ReviewSuppressionKind,
  id: string,
  action: ReviewActionType,
  label?: string
): ReviewActionStat[] {
  const now = new Date().toISOString();
  const existingIndex = stats.findIndex((item) => item.kind === kind && item.id === id);

  if (existingIndex === -1) {
    return sortReviewActionStats([
      ...stats,
      {
        id,
        kind,
        ...(label ? { label } : {}),
        snoozes: action === "snooze" ? 1 : 0,
        dismisses: action === "dismiss" ? 1 : 0,
        restores: action === "restore" ? 1 : 0,
        lastAction: action,
        lastActionAt: now,
      },
    ]);
  }

  const next = [...stats];
  const existing = next[existingIndex];
  next[existingIndex] = {
    ...existing,
    ...(label ? { label } : {}),
    snoozes: existing.snoozes + (action === "snooze" ? 1 : 0),
    dismisses: existing.dismisses + (action === "dismiss" ? 1 : 0),
    restores: existing.restores + (action === "restore" ? 1 : 0),
    lastAction: action,
    lastActionAt: now,
  };

  return sortReviewActionStats(next);
}

function upsertClarificationQuestionStat(
  stats: ClarificationQuestionStat[],
  key: string,
  label: string,
  action: ClarificationFeedbackAction
): ClarificationQuestionStat[] {
  const now = new Date().toISOString();
  const existingIndex = stats.findIndex((item) => item.key === key);

  if (existingIndex === -1) {
    return sortClarificationQuestionStats([
      ...stats,
      {
        key,
        label,
        answers: action === "answered" ? 1 : 0,
        dismisses: action === "dismissed" ? 1 : 0,
        restores: action === "restored" ? 1 : 0,
        lastAction: action,
        lastActionAt: now,
      },
    ]);
  }

  const next = [...stats];
  const existing = next[existingIndex];
  next[existingIndex] = {
    ...existing,
    label,
    answers: existing.answers + (action === "answered" ? 1 : 0),
    dismisses: existing.dismisses + (action === "dismissed" ? 1 : 0),
    restores: existing.restores + (action === "restored" ? 1 : 0),
    lastAction: action,
    lastActionAt: now,
  };

  return sortClarificationQuestionStats(next);
}

async function persistThinkingMemory(userId: string, memory: ThinkingMemory): Promise<void> {
  const reviewState = pruneReviewState(memory.reviewState);
  const reviewActionStats = sortReviewActionStats(memory.reviewActionStats);
  const clarificationQuestionStats = sortClarificationQuestionStats(memory.clarificationQuestionStats);
  const clarificationQuestionEvents = sortClarificationQuestionEvents(memory.clarificationQuestionEvents);

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
        reviewActionStats,
        clarificationQuestionStats,
        clarificationQuestionEvents,
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
        reviewActionStats,
        clarificationQuestionStats,
        clarificationQuestionEvents,
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
    reviewActionStats: sortReviewActionStats(parseReviewActionStats(raw.reviewActionStats)),
    clarificationQuestionStats: sortClarificationQuestionStats(parseClarificationQuestionStats(raw.clarificationQuestionStats)),
    clarificationQuestionEvents: sortClarificationQuestionEvents(parseClarificationQuestionEvents(raw.clarificationQuestionEvents)),
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
    reviewActionStats: current.reviewActionStats,
    clarificationQuestionStats: current.clarificationQuestionStats,
    clarificationQuestionEvents: current.clarificationQuestionEvents,
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

/** Return sorted review-action telemetry for settings and future ranking work. */
export async function getReviewActionStats(userId: string): Promise<ReviewActionStat[]> {
  const memory = await getThinkingMemory(userId);
  return sortReviewActionStats(memory.reviewActionStats)
    .filter((stat) => stat.snoozes > 0 || stat.dismisses > 0 || stat.restores > 0);
}

/** Return clarification question feedback stats for settings and follow-up filtering. */
export async function getClarificationQuestionStats(userId: string): Promise<ClarificationQuestionStat[]> {
  const memory = await getThinkingMemory(userId);
  return sortClarificationQuestionStats(memory.clarificationQuestionStats)
    .filter((stat) => stat.answers > 0 || stat.dismisses > 0 || stat.restores > 0);
}

/** Record whether one clarification question style was answered or dismissed by the user. */
export async function recordClarificationQuestionFeedback(
  userId: string,
  question: string,
  action: ClarificationFeedbackAction
): Promise<void> {
  const current = await getThinkingMemory(userId);
  const key = buildClarificationQuestionKey(question);
  const clarificationQuestionStats = upsertClarificationQuestionStat(
    current.clarificationQuestionStats,
    key,
    question,
    action
  );
  const clarificationQuestionEvents = sortClarificationQuestionEvents([
    {
      key,
      label: question,
      action,
      createdAt: new Date().toISOString(),
    },
    ...current.clarificationQuestionEvents,
  ]);

  await persistThinkingMemory(userId, {
    ...current,
    clarificationQuestionStats,
    clarificationQuestionEvents,
  });
}

/** Restore one clarification question style so it can reappear without deleting prior history. */
export async function restoreClarificationQuestionFeedback(userId: string, key: string): Promise<boolean> {
  const current = await getThinkingMemory(userId);
  const existing = current.clarificationQuestionStats.find((stat) => stat.key === key);

  if (!existing) {
    return false;
  }

  const clarificationQuestionStats = upsertClarificationQuestionStat(
    current.clarificationQuestionStats,
    existing.key,
    existing.label,
    "restored"
  );
  const clarificationQuestionEvents = sortClarificationQuestionEvents([
    {
      key: existing.key,
      label: existing.label,
      action: "restored",
      createdAt: new Date().toISOString(),
    },
    ...current.clarificationQuestionEvents,
  ]);

  await persistThinkingMemory(userId, {
    ...current,
    clarificationQuestionStats,
    clarificationQuestionEvents,
  });

  return true;
}

/** Return whether a review item is currently suppressed. */
export function isReviewItemSuppressed(
  reviewState: ReviewState,
  kind: ReviewSuppressionKind,
  id: string,
  now = new Date()
): boolean {
  const items = reviewState[getReviewStateKey(kind)];

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
  action: Extract<ReviewActionType, "snooze" | "dismiss">,
  durationDays: number,
  label?: string
): Promise<string> {
  const current = await getThinkingMemory(userId);
  const until = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();
  const reviewState = pruneReviewState(current.reviewState);
  const reviewActionStats = upsertReviewActionStat(current.reviewActionStats, kind, id, action, label);
  const key = getReviewStateKey(kind);
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
    reviewActionStats,
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
  const key = getReviewStateKey(kind);
  const existingLabel = reviewState[key].find((item) => item.id === id)?.label;
  const reviewActionStats = upsertReviewActionStat(current.reviewActionStats, kind, id, "restore", existingLabel);

  await persistThinkingMemory(userId, {
    ...current,
    reviewState: {
      ...reviewState,
      [key]: reviewState[key].filter((item) => item.id !== id),
    },
    reviewActionStats,
  });
}
