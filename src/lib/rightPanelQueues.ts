export interface PriorityQueueSourceNote {
  id: string;
  title: string | null;
  extractedTasks: unknown;
}

export interface PriorityQueueItem {
  noteId: string;
  noteTitle: string;
  text: string;
  dueDate: string | null;
}

/** Validate one extracted task candidate before it appears in the priority queue. */
function toOpenPriorityTask(raw: unknown): { text: string; dueDate: string | null } | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const task = raw as {
    text?: unknown;
    dueDate?: unknown;
    completed?: unknown;
  };

  if (typeof task.text !== "string" || !task.text.trim()) {
    return null;
  }

  if (task.completed === true) {
    return null;
  }

  return {
    text: task.text.trim(),
    dueDate: typeof task.dueDate === "string" && task.dueDate.trim() ? task.dueDate.trim() : null,
  };
}

/**
 * Flatten high-priority notes into the top open tasks for the shared right panel.
 * Notes are assumed to already be ordered by recency or urgency upstream.
 */
export function getPriorityQueueItems(
  notes: PriorityQueueSourceNote[],
  limit = 3
): PriorityQueueItem[] {
  const items: PriorityQueueItem[] = [];

  for (const note of notes) {
    if (!Array.isArray(note.extractedTasks)) {
      continue;
    }

    for (const rawTask of note.extractedTasks) {
      const task = toOpenPriorityTask(rawTask);

      if (!task) {
        continue;
      }

      items.push({
        noteId: note.id,
        noteTitle: note.title || "Untitled note",
        text: task.text,
        dueDate: task.dueDate,
      });

      if (items.length >= limit) {
        return items;
      }
    }
  }

  return items;
}

/** Return the first visible clarification question from aiMeta, if one exists. */
export function getFirstClarificationQuestion(aiMeta: unknown): string | null {
  if (!aiMeta || typeof aiMeta !== "object" || Array.isArray(aiMeta)) {
    return null;
  }

  const maybeQuestions = (aiMeta as { clarificationQuestions?: unknown }).clarificationQuestions;
  if (!Array.isArray(maybeQuestions)) {
    return null;
  }

  const firstQuestion = maybeQuestions.find((question): question is string => typeof question === "string" && question.trim().length > 0);
  return firstQuestion?.trim() || null;
}