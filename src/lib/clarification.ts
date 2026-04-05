export interface ClarificationTurn {
  question: string;
  answer: string;
  kind: "freeform" | "project" | "context";
  createdAt: string;
}

export type ClarificationFeedbackAction = "answered" | "dismissed" | "restored";

export interface ClarificationQuestionStat {
  key: string;
  label: string;
  answers: number;
  dismisses: number;
  restores: number;
  lastAction: ClarificationFeedbackAction;
  lastActionAt: string;
}

export interface ClarificationNoiseAssessment {
  noiseScore: number;
  penalty: number;
  level: "normal" | "downranked" | "suppressed";
}

const QUESTION_STYLE_PATTERNS: Array<{ key: string; pattern: RegExp }> = [
  { key: "project", pattern: /\bproject\b|\bwork stream\b|\binitiative\b/i },
  { key: "context", pattern: /\bcontext\b|\bcategory\b|\barea\b|\bsituation\b/i },
  { key: "owner", pattern: /\bwho\b|\bowner\b|\bassigned\b|\bresponsible\b/i },
  { key: "timing", pattern: /\bwhen\b|\bdue\b|\bdeadline\b|\bdate\b|\btime\b/i },
  { key: "priority", pattern: /\bpriority\b|\burgent\b|\bimportance\b/i },
  { key: "type", pattern: /\btask\b|\bidea\b|\bnote\b|\breference\b|\bdecision\b|\btype\b/i },
  { key: "topic", pattern: /\btopic\b|\babout\b|\btheme\b|\bmeaning\b/i },
];

export interface ParsedNoteAiMeta {
  intent: string | null;
  nextAction: string | null;
  clarificationQuestions: string[];
  clarificationHistory: ClarificationTurn[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Normalize one clarification question into a stable style key for telemetry grouping. */
export function buildClarificationQuestionKey(question: string): string {
  const normalized = question.trim().toLowerCase();

  for (const matcher of QUESTION_STYLE_PATTERNS) {
    if (matcher.pattern.test(normalized)) {
      return matcher.key;
    }
  }

  const compact = normalized
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return compact ? `custom:${compact}` : "custom:unknown";
}

/**
 * Convert clarification feedback into a noise assessment.
 * Dismisses count against a question style, while answered and restored styles offset that noise.
 */
export function getClarificationQuestionNoiseAssessment(
  stat?: ClarificationQuestionStat | null
): ClarificationNoiseAssessment {
  if (!stat) {
    return {
      noiseScore: 0,
      penalty: 0,
      level: "normal",
    };
  }

  const rawNoiseScore = stat.dismisses * 2 - stat.answers * 2 - stat.restores * 4;
  const noiseScore = Math.max(0, rawNoiseScore);

  if (noiseScore >= 4 && stat.dismisses >= 2) {
    return {
      noiseScore,
      penalty: 999,
      level: "suppressed",
    };
  }

  if (noiseScore >= 2) {
    return {
      noiseScore,
      penalty: noiseScore * 10,
      level: "downranked",
    };
  }

  return {
    noiseScore,
    penalty: 0,
    level: "normal",
  };
}

/**
 * Filter and re-order clarification questions based on prior dismiss/answer feedback.
 * Heavily dismissed question styles are removed, lightly noisy ones are pushed later.
 */
export function filterClarificationQuestionsByFeedback(
  questions: string[],
  stats: ClarificationQuestionStat[]
): string[] {
  const statMap = new Map(stats.map((stat) => [stat.key, stat]));
  const seenKeys = new Set<string>();

  return questions
    .map((question, index) => {
      const key = buildClarificationQuestionKey(question);
      return {
        question,
        index,
        key,
        assessment: getClarificationQuestionNoiseAssessment(statMap.get(key)),
      };
    })
    .filter((entry) => {
      if (entry.assessment.level === "suppressed") {
        return false;
      }

      if (seenKeys.has(entry.key)) {
        return false;
      }

      seenKeys.add(entry.key);
      return true;
    })
    .sort((left, right) => left.assessment.penalty - right.assessment.penalty || left.index - right.index)
    .map((entry) => entry.question)
    .slice(0, 3);
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