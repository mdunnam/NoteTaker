export interface ClarificationTurn {
  question: string;
  answer: string;
  kind: "freeform" | "project" | "context";
  createdAt: string;
}

export interface ParsedNoteAiMeta {
  intent: string | null;
  nextAction: string | null;
  clarificationQuestions: string[];
  clarificationHistory: ClarificationTurn[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Parse a stored clarification history array safely from note aiMeta. */
export function parseClarificationHistory(raw: unknown): ClarificationTurn[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.filter((item): item is ClarificationTurn => {
    if (!isRecord(item)) {
      return false;
    }

    return (
      typeof item.question === "string" &&
      typeof item.answer === "string" &&
      (item.kind === "freeform" || item.kind === "project" || item.kind === "context") &&
      typeof item.createdAt === "string"
    );
  });
}

/** Parse the aiMeta JSON blob used throughout note UI and note regeneration. */
export function parseNoteAiMeta(raw: unknown): ParsedNoteAiMeta {
  if (!isRecord(raw)) {
    return {
      intent: null,
      nextAction: null,
      clarificationQuestions: [],
      clarificationHistory: [],
    };
  }

  return {
    intent: typeof raw.intent === "string" ? raw.intent : null,
    nextAction: typeof raw.nextAction === "string" ? raw.nextAction : null,
    clarificationQuestions: Array.isArray(raw.clarificationQuestions)
      ? raw.clarificationQuestions.filter((question): question is string => typeof question === "string")
      : [],
    clarificationHistory: parseClarificationHistory(raw.clarificationHistory),
  };
}

/** Append one clarification turn while keeping the thread bounded and ordered. */
export function appendClarificationTurn(
  history: ClarificationTurn[],
  turn: ClarificationTurn
): ClarificationTurn[] {
  return [...history, turn].slice(-12);
}

/** Build a compact clarification transcript to feed back into note organization. */
export function buildClarificationContext(history: ClarificationTurn[]): string {
  if (history.length === 0) {
    return "";
  }

  const transcript = history
    .slice(-8)
    .map((turn, index) => {
      return `${index + 1}. AI asked: ${turn.question}\nUser answered: ${turn.answer}`;
    })
    .join("\n\n");

  return `Clarification conversation:\n${transcript}`;
}