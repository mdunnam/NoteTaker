interface SimilarityContext {
  suggestedProject: string | null;
  category: string | null;
}

export interface SimilarityCandidate {
  id: string;
  title: string | null;
  summary: string | null;
  createdAt: string | Date;
  suggestedProject: string | null;
  category: string | null;
  score: number;
}

interface OverlapNotePreview {
  id: string;
  title: string | null;
  summary: string | null;
  createdAt: string;
}

export interface DuplicateSuggestion {
  note: OverlapNotePreview;
  score: number;
  reason: string;
}

export interface ContextualResurfacingMatch {
  note: OverlapNotePreview;
  score: number;
  reason: string;
}

/** Normalize one Date or ISO string into a stable ISO string. */
function toIsoString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

/** Build a small preview payload for overlap UI surfaces. */
function toOverlapPreview(candidate: SimilarityCandidate): OverlapNotePreview {
  return {
    id: candidate.id,
    title: candidate.title,
    summary: candidate.summary,
    createdAt: toIsoString(candidate.createdAt),
  };
}

/** Describe any shared project/category signals between the current note and a candidate. */
function getSharedSignals(current: SimilarityContext, candidate: SimilarityContext): string[] {
  const signals: string[] = [];

  if (current.suggestedProject && candidate.suggestedProject === current.suggestedProject) {
    signals.push(`project ${candidate.suggestedProject}`);
  }

  if (current.category && candidate.category === current.category) {
    signals.push(`${candidate.category} context`);
  }

  return signals;
}

/** Explain why a near-duplicate match or resurfacing match was selected. */
function buildOverlapReason(
  kind: "duplicate" | "resurfacing",
  score: number,
  sharedSignals: string[]
): string {
  const percent = Math.round(score * 100);

  if (kind === "duplicate") {
    return sharedSignals.length > 0
      ? `${percent}% overlap with shared ${sharedSignals.join(" and ")}.`
      : `${percent}% overlap with an earlier note.`;
  }

  return sharedSignals.length > 0
    ? `Earlier note with ${percent}% semantic overlap and shared ${sharedSignals.join(" and ")}.`
    : `Earlier note with ${percent}% semantic overlap.`;
}

/** Pick the strongest candidate above the duplicate threshold. */
export function buildDuplicateSuggestion(
  current: SimilarityContext,
  candidates: SimilarityCandidate[],
  threshold = 0.9
): DuplicateSuggestion | null {
  const topCandidate = [...candidates]
    .filter((candidate) => candidate.score >= threshold)
    .sort((left, right) => right.score - left.score)[0];

  if (!topCandidate) {
    return null;
  }

  return {
    note: toOverlapPreview(topCandidate),
    score: topCandidate.score,
    reason: buildOverlapReason("duplicate", topCandidate.score, getSharedSignals(current, topCandidate)),
  };
}

/** Surface older semantically related notes as context-aware resurfacing matches. */
export function buildContextAwareResurfacing(
  currentCreatedAt: string | Date,
  current: SimilarityContext,
  candidates: SimilarityCandidate[],
  limit = 2
): ContextualResurfacingMatch[] {
  const currentTimestamp = new Date(toIsoString(currentCreatedAt)).getTime();

  return [...candidates]
    .filter((candidate) => new Date(toIsoString(candidate.createdAt)).getTime() < currentTimestamp)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((candidate) => ({
      note: toOverlapPreview(candidate),
      score: candidate.score,
      reason: buildOverlapReason("resurfacing", candidate.score, getSharedSignals(current, candidate)),
    }));
}

/** Parse a duplicate suggestion persisted in aiMeta back into a typed payload. */
export function parseDuplicateSuggestion(raw: unknown): DuplicateSuggestion | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const value = raw as Record<string, unknown>;
  const note = value.note;

  if (!note || typeof note !== "object" || Array.isArray(note)) {
    return null;
  }

  const parsedNote = note as Record<string, unknown>;
  if (
    typeof parsedNote.id !== "string" ||
    (typeof parsedNote.title !== "string" && parsedNote.title !== null) ||
    (typeof parsedNote.summary !== "string" && parsedNote.summary !== null) ||
    typeof parsedNote.createdAt !== "string" ||
    typeof value.score !== "number" ||
    typeof value.reason !== "string"
  ) {
    return null;
  }

  return {
    note: {
      id: parsedNote.id,
      title: parsedNote.title as string | null,
      summary: parsedNote.summary as string | null,
      createdAt: parsedNote.createdAt,
    },
    score: value.score,
    reason: value.reason,
  };
}