import { parseNoteAiMeta } from "@/lib/clarification";

export interface NoteHealthInput {
  id: string;
  title: string | null;
  summary?: string | null;
  category: string | null;
  type: string | null;
  status: string;
  confidenceScore: number | null;
  priority: string | null;
  suggestedProject?: string | null;
  aiMeta: unknown;
  extractedTasks?: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface NoteHealthAssessment {
  score: number;
  state: "healthy" | "watch" | "at-risk";
  label: string;
  staleDays: number;
  extractedTaskCount: number;
  needsClarification: boolean;
  reasons: string[];
}

export interface WorkspaceHealthSummary {
  averageScore: number;
  healthyCount: number;
  watchCount: number;
  atRiskCount: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function countExtractedTasks(raw: unknown): number {
  if (!Array.isArray(raw)) {
    return 0;
  }

  return raw.filter((item) => {
    return !!item && typeof item === "object" && !Array.isArray(item) && typeof (item as { text?: unknown }).text === "string";
  }).length;
}

/**
 * Score one note for operational health using confidence, staleness, missing structure, and unresolved clarification pressure.
 */
export function getNoteHealthAssessment(note: NoteHealthInput, now = new Date()): NoteHealthAssessment {
  const aiMeta = parseNoteAiMeta(note.aiMeta);
  const extractedTaskCount = countExtractedTasks(note.extractedTasks);
  const staleDays = Math.max(0, Math.floor((now.getTime() - note.updatedAt.getTime()) / (24 * 60 * 60 * 1000)));
  const needsClarification = (note.confidenceScore ?? 1) < 0.65 && aiMeta.clarificationQuestions.length > 0;

  let score = 100;
  const reasons: string[] = [];

  if (note.status === "PROCESSING") {
    score -= 25;
    reasons.push("AI organization is still processing.");
  }

  if ((note.confidenceScore ?? 0) < 0.45) {
    score -= 35;
    reasons.push("Very low confidence classification still needs attention.");
  } else if ((note.confidenceScore ?? 0) < 0.65) {
    score -= 20;
    reasons.push("Low confidence suggests the note still needs clarification.");
  } else if ((note.confidenceScore ?? 0) < 0.8) {
    score -= 8;
    reasons.push("Confidence is usable but still worth a quick review.");
  }

  if (needsClarification) {
    score -= 18;
    reasons.push("Open clarification questions are blocking a cleaner organization.");
  }

  if (!note.category?.trim()) {
    score -= 10;
    reasons.push("Missing category makes this harder to browse later.");
  }

  if ((note.type === "TASK" || note.priority === "high") && !note.suggestedProject?.trim()) {
    score -= 8;
    reasons.push("No project context is attached to an actionable note.");
  }

  if (!note.summary?.trim() && note.status === "PROCESSED") {
    score -= 8;
    reasons.push("No AI summary yet, which weakens resurfacing and synthesis.");
  }

  if (note.priority === "high" && staleDays >= 5) {
    score -= 18;
    reasons.push(`High-priority note has been idle for ${staleDays} days.`);
  } else if (staleDays >= 30) {
    score -= 12;
    reasons.push(`Note has been stale for ${staleDays} days.`);
  } else if (staleDays >= 14) {
    score -= 6;
    reasons.push(`Note has not been revisited in ${staleDays} days.`);
  }

  if (extractedTaskCount > 0 && staleDays >= 14) {
    score -= 10;
    reasons.push(`Contains ${extractedTaskCount} extracted task${extractedTaskCount === 1 ? "" : "s"} that may be aging out.`);
  }

  const normalizedScore = clamp(Math.round(score), 0, 100);
  const state = normalizedScore >= 75 ? "healthy" : normalizedScore >= 50 ? "watch" : "at-risk";

  return {
    score: normalizedScore,
    state,
    label: state === "healthy" ? "Healthy" : state === "watch" ? "Watch" : "At risk",
    staleDays,
    extractedTaskCount,
    needsClarification,
    reasons: reasons.slice(0, 4),
  };
}

/** Summarize note-health distribution for one workspace view. */
export function summarizeWorkspaceHealth(notes: NoteHealthInput[], now = new Date()): WorkspaceHealthSummary {
  if (notes.length === 0) {
    return {
      averageScore: 0,
      healthyCount: 0,
      watchCount: 0,
      atRiskCount: 0,
    };
  }

  const assessments = notes.map((note) => getNoteHealthAssessment(note, now));

  return {
    averageScore: Math.round(assessments.reduce((sum, item) => sum + item.score, 0) / assessments.length),
    healthyCount: assessments.filter((item) => item.state === "healthy").length,
    watchCount: assessments.filter((item) => item.state === "watch").length,
    atRiskCount: assessments.filter((item) => item.state === "at-risk").length,
  };
}