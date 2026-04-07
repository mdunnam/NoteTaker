import type { ReviewPatternCandidate } from "@/lib/resurfacing";

type TimeSignalKind = "project" | "context" | "tag";

export interface TimeResurfacingNoteInput {
  id: string;
  title: string | null;
  summary: string | null;
  createdAt: Date;
  updatedAt: Date;
  suggestedProject: string | null;
  category: string | null;
  tags: string[];
  extractedTasks: unknown;
}

export interface TimeResurfacingTask {
  noteId: string;
  noteTitle: string;
  text: string;
  dueDate: string | null;
}

export interface TimeResurfacingConnection {
  kind: TimeSignalKind;
  label: string;
  noteCount: number;
  reason: string;
  notes: Array<{
    id: string;
    title: string | null;
  }>;
}

export interface TimeResurfacingSummary {
  todayTasks: TimeResurfacingTask[];
  todayConnections: TimeResurfacingConnection[];
  weeklyThreads: TimeResurfacingConnection[];
  weeklyPatternCount: number;
  weeklyRegroupingCount: number;
}

interface TimeSignal {
  kind: TimeSignalKind;
  label: string;
}

/** Prefer project/context signals over tags when counts tie. */
function getSignalKindWeight(kind: TimeSignalKind): number {
  if (kind === "project") {
    return 3;
  }

  if (kind === "context") {
    return 2;
  }

  return 1;
}

/** Normalize a signal label so grouping stays stable across notes. */
function normalizeSignal(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/** Return deduplicated project, category, and tag signals for one note. */
function getSignals(note: TimeResurfacingNoteInput): TimeSignal[] {
  const seen = new Set<string>();
  const signals: TimeSignal[] = [];

  const pushSignal = (kind: TimeSignalKind, raw: string | null | undefined) => {
    const label = normalizeSignal(raw || "");
    if (!label) {
      return;
    }

    const key = `${kind}:${label.toLowerCase()}`;
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    signals.push({ kind, label });
  };

  pushSignal("project", note.suggestedProject);
  pushSignal("context", note.category);

  for (const tag of note.tags || []) {
    pushSignal("tag", tag);
  }

  return signals;
}

/** Parse open extracted tasks from a note. */
function getOpenTasks(note: TimeResurfacingNoteInput): TimeResurfacingTask[] {
  if (!Array.isArray(note.extractedTasks)) {
    return [];
  }

  return note.extractedTasks
    .filter((task) => !!task && typeof task === "object" && !Array.isArray(task))
    .map((task) => task as { text?: unknown; dueDate?: unknown; completed?: unknown })
    .filter((task) => typeof task.text === "string" && task.text.trim().length > 0 && task.completed !== true)
    .map((task) => ({
      noteId: note.id,
      noteTitle: note.title || "Untitled note",
      text: (task.text as string).trim(),
      dueDate: typeof task.dueDate === "string" && task.dueDate.trim() ? task.dueDate.trim() : null,
    }));
}

/** Group notes by shared signals over a time window and return the strongest connections. */
function buildConnections(
  notes: TimeResurfacingNoteInput[],
  minimumNoteCount: number,
  reasonBuilder: (label: string, noteCount: number) => string,
  limit: number
): TimeResurfacingConnection[] {
  const groups = new Map<string, { kind: TimeSignalKind; label: string; notes: TimeResurfacingNoteInput[] }>();

  for (const note of notes) {
    for (const signal of getSignals(note)) {
      const key = `${signal.kind}:${signal.label.toLowerCase()}`;
      const current = groups.get(key) || { kind: signal.kind, label: signal.label, notes: [] };
      current.notes.push(note);
      groups.set(key, current);
    }
  }

  return [...groups.values()]
    .filter((group) => group.notes.length >= minimumNoteCount)
    .sort((left, right) => {
      return (
        right.notes.length - left.notes.length ||
        getSignalKindWeight(right.kind) - getSignalKindWeight(left.kind) ||
        left.label.localeCompare(right.label)
      );
    })
    .slice(0, limit)
    .map((group) => ({
      kind: group.kind,
      label: group.label,
      noteCount: group.notes.length,
      reason: reasonBuilder(group.label, group.notes.length),
      notes: group.notes.slice(0, 3).map((note) => ({ id: note.id, title: note.title })),
    }));
}

/**
 * Derive an in-app time-based resurfacing summary from recent notes plus existing pattern/regrouping counts.
 */
export function buildTimeResurfacingSummary(
  notes: TimeResurfacingNoteInput[],
  options?: {
    now?: Date;
    reviewPatterns?: ReviewPatternCandidate[];
    reclassificationCount?: number;
  }
): TimeResurfacingSummary {
  const now = options?.now || new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const todaysNotes = notes.filter((note) => note.createdAt >= todayStart || note.updatedAt >= todayStart);
  const weeklyNotes = notes.filter((note) => note.createdAt >= weekStart || note.updatedAt >= weekStart);

  return {
    todayTasks: todaysNotes.flatMap((note) => getOpenTasks(note)).slice(0, 5),
    todayConnections: buildConnections(
      todaysNotes,
      2,
      (label, noteCount) => `${noteCount} notes from today connect around ${label}.`,
      2
    ),
    weeklyThreads: buildConnections(
      weeklyNotes,
      3,
      (label, noteCount) => `${noteCount} notes this week still circle around ${label}.`,
      3
    ),
    weeklyPatternCount: options?.reviewPatterns?.length || 0,
    weeklyRegroupingCount: options?.reclassificationCount || 0,
  };
}