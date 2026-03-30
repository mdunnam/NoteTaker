import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

interface MemoryItem {
  name: string;
  count: number;
  lastSeen: string;
}

interface ThinkingMemory {
  knownProjects: MemoryItem[];
  knownContexts: MemoryItem[];
  knownPeople: MemoryItem[];
  knownTopics: MemoryItem[];
}

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
  };
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

  await prisma.userPreferences.upsert({
    where: { userId },
    create: {
      userId,
      thinkingMemory: {
        knownProjects,
        knownContexts,
        knownPeople,
        knownTopics,
      } as unknown as Prisma.InputJsonValue,
    },
    update: {
      thinkingMemory: {
        knownProjects,
        knownContexts,
        knownPeople,
        knownTopics,
      } as unknown as Prisma.InputJsonValue,
    },
  });
}
