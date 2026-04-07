import OpenAI from "openai";
import { z } from "zod";
import {
  filterClarificationQuestionsByFeedback,
  getClarificationQuestionNoiseAssessment,
  type ClarificationQuestionStat,
} from "@/lib/clarification";

const openaiClient = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

type OrganizedNote = z.infer<typeof OrganizedNoteSchema>;

/**
 * Schema for organized note output from AI
 */
const OrganizedNoteSchema = z.object({
  title: z.string().describe("Specific, actionable title (max 80 chars)"),
  summary: z.string().describe("Interpretive 1-2 sentence summary — why it matters and what to do"),
  intent: z.string().describe("The user's underlying goal in one sentence"),
  nextAction: z.string().nullable().optional().describe("Single most important immediate action, or null"),
  priority: z.enum(["high", "medium", "low"]).default("medium").describe("Note urgency"),
  category: z.string().describe("Suggested category (e.g., Work, Personal, Project)"),
  type: z.enum(["TASK", "IDEA", "NOTE", "REFERENCE", "DECISION"]).describe("Type of note"),
  tags: z.array(z.string()).describe("Suggested tags"),
  suggestedProject: z.string().optional().nullable().describe("Project this belongs to — match known projects first"),
  extractedTasks: z
    .array(
      z.object({
        text: z.string(),
        dueDate: z.string().nullable().optional(),
        priority: z.enum(["high", "medium", "low"]).default("medium"),
      })
    )
    .describe("Atomic, immediately-executable tasks extracted from the note"),
  extractedDates: z
    .array(z.string())
    .describe("Dates or time references mentioned"),
  extractedEntities: z
    .array(
      z.object({
        type: z.enum(["PERSON", "PROJECT", "APP", "COMPANY", "PLACE", "TOPIC"]),
        name: z.string(),
      })
    )
    .describe("People, projects, topics, etc. mentioned"),
  clarificationQuestions: z
    .array(z.string())
    .default([])
    .describe("Questions to ask user when confidence < 0.65"),
  confidenceScore: z.number().min(0).max(1).describe("Confidence in the organization (0-1)"),
});

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "for",
  "from",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "with",
]);

/**
 * Schema for split notes output
 */
const SplitNotesSchema = z.object({
  notes: z
    .array(
      z.object({
        content: z.string(),
        category: z.string(),
        type: z.enum(["TASK", "IDEA", "NOTE", "REFERENCE", "DECISION"]),
        title: z.string(),
      })
    )
    .describe("Array of individual notes split from the input"),
  needsSplit: z.boolean().describe("Whether this note needed splitting"),
});

const SynthesizedNotesSchema = z.object({
  title: z.string(),
  summary: z.string(),
  themes: z.array(z.string()).max(6).default([]),
  actions: z.array(z.string()).max(6).default([]),
  openQuestions: z.array(z.string()).max(6).default([]),
  dominantProject: z.string().nullable().optional(),
  dominantCategory: z.string().nullable().optional(),
  plan: z.object({
    objective: z.string(),
    firstMove: z.string(),
    steps: z.array(z.object({
      title: z.string(),
      detail: z.string(),
      horizon: z.enum(["now", "next", "later"]),
    })).max(6).default([]),
    risks: z.array(z.string()).max(5).default([]),
    successSignal: z.string(),
  }).optional(),
});

/**
 * Tokenize text for overlap scoring to detect extractive summaries.
 */
function tokenizeForSimilarity(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

/**
 * Detect whether a summary is mostly copied from the raw note.
 */
function isWeakExtractiveSummary(rawContent: string, summary: string): boolean {
  const normalizedSummary = summary.trim();
  if (!normalizedSummary) {
    return true;
  }

  if (normalizedSummary.length < 24) {
    return true;
  }

  const normalizedRaw = rawContent.trim().toLowerCase();
  if (!normalizedRaw) {
    return false;
  }

  if (normalizedRaw.includes(normalizedSummary.toLowerCase())) {
    return true;
  }

  const summaryTokens = tokenizeForSimilarity(normalizedSummary);
  const rawTokens = new Set(tokenizeForSimilarity(normalizedRaw));

  if (summaryTokens.length < 4) {
    return false;
  }

  const overlap = summaryTokens.filter((token) => rawTokens.has(token)).length;
  const overlapRatio = overlap / summaryTokens.length;

  // If most meaningful words are copied, force a rewrite.
  return overlapRatio >= 0.85;
}

/**
 * Build a concise fallback summary from extracted structure when the AI summary is weak.
 */
function synthesizeStructuredSummary(rawContent: string, organized: OrganizedNote): string {
  const taskLead = organized.extractedTasks?.slice(0, 2).map((task) => task.text).filter(Boolean) || [];
  const entityLead = organized.extractedEntities?.slice(0, 2).map((entity) => entity.name).filter(Boolean) || [];

  if (taskLead.length > 0) {
    return `Mixed ${organized.category || "general".toLowerCase()} note with actionable items. Key actions: ${taskLead.join("; ")}.`;
  }

  if (entityLead.length > 0) {
    return `Note focused on ${entityLead.join(" and ")} in a ${organized.category || "general".toLowerCase()} context.`;
  }

  const firstLine = rawContent.split("\n").map((line) => line.trim()).find(Boolean) || "captured note";
  return `Captured ${organized.type?.toLowerCase() || "note"} in ${organized.category || "General"}: ${firstLine.slice(0, 120)}.`;
}

function buildSynthesisFallback(notes: SynthesisNoteInput[]): SynthesizedNotesPayload {
  const projects = notes.map((note) => note.suggestedProject).filter(Boolean) as string[];
  const categories = notes.map((note) => note.category).filter(Boolean) as string[];
  const themes = [...new Set([
    ...projects,
    ...categories,
    ...notes.flatMap((note) => {
      const source = `${note.title || ""} ${note.summary || note.rawContent}`.toLowerCase();
      return source.split(/[^a-z0-9]+/).filter((token) => token.length > 4).slice(0, 2);
    }),
  ])].slice(0, 5);

  return {
    title: notes.length <= 2 ? "Shared note synthesis" : `Synthesis across ${notes.length} notes`,
    summary: `These notes are circling around ${themes.slice(0, 3).join(", ") || "a shared thread"}. Review the common actions and open questions to turn the cluster into a next step.`,
    themes,
    actions: notes
      .map((note) => note.summary || note.title || note.rawContent.split("\n")[0] || "Review note")
      .filter(Boolean)
      .slice(0, 4),
    openQuestions: [
      "What is the single next step across these notes?",
      "Which note should become the source of truth?",
    ],
    dominantProject: projects[0] || null,
    dominantCategory: categories[0] || null,
    plan: {
      objective: projects[0]
        ? `Turn the selected notes into a concrete plan for ${projects[0]}.`
        : `Turn the selected notes into one coherent plan.` ,
      firstMove: notes[0]?.summary || notes[0]?.title || "Review the selected notes and choose one concrete next move.",
      steps: [
        {
          title: "Clarify the main objective",
          detail: projects[0]
            ? `Anchor the work around ${projects[0]} and decide what outcome matters most right now.`
            : "Decide what single outcome the selected notes should drive toward.",
          horizon: "now",
        },
        {
          title: "Convert the strongest actions into a short plan",
          detail: "Choose the most important actions from the synthesis and order them by urgency.",
          horizon: "next",
        },
        {
          title: "Remove ambiguity before execution",
          detail: "Answer the remaining open questions so the plan can move without more note-churn.",
          horizon: "later",
        },
      ],
      risks: [
        "The selected notes may still mix more than one objective.",
        "Open questions may block execution if they are not resolved early.",
      ],
      successSignal: "You end up with one clear next move and a short ordered plan instead of another loose cluster of notes.",
    },
    noteCount: notes.length,
    sourceNoteIds: notes.map((note) => note.id),
  };
}

/**
 * Rewrite weak summaries so they explain intent rather than echoing the raw note.
 * With gpt-4o this only triggers as a last-resort local fallback — no extra API call.
 */
async function improveSummaryIfNeeded(rawContent: string, organized: OrganizedNote): Promise<string> {
  if (!isWeakExtractiveSummary(rawContent, organized.summary)) {
    return organized.summary.trim();
  }
  // Fallback: synthesize locally without an extra API round-trip
  return synthesizeStructuredSummary(rawContent, organized);
}

/** System prompt for organizeNote — behaviorally explicit, multi-section. */
const ORGANIZE_SYSTEM_PROMPT = `You are the personal intelligence layer for a fast-capture note system. Your job is to decode what a person truly means — not just transcribe what they wrote.

IDENTITY
Act as a brilliant personal assistant who has read every note this person ever wrote. You know their projects, their collaborators, their patterns. Apply that knowledge to make every new note immediately useful.

CORE RULES
1. Infer intent, don’t just parse text. "call jim invoices" means the user needs to follow up with Jim about an invoice issue — say that.
2. Titles must be specific and actionable (max 80 chars). "Schedule Jim invoice follow-up" not "Jim/Invoices" and never "Note".
3. Summaries explain value: write as if surfacing this note to the user in 3 weeks. Why does it matter? What should they do? Never copy the note wording back.
4. Intent: one sentence capturing the underlying goal or concern behind the note.
5. nextAction: the single most important next step. Null only if there is genuinely nothing to act on.
6. Tasks must be atomic and immediately executable. "Reply to Sarah’s message about contract renewal" not "emails". One clear action per item.
7. Use known projects: if a known project from the user’s memory profile fits, use its exact name as suggestedProject. Do not invent project names.
8. Be honest about confidence. Do not inflate it. If you are guessing, lower the score and add clarificationQuestions.
9. If clarification answers are provided, treat them as authoritative user guidance. Incorporate them directly and do not ask the same question again.

PRIORITY
Assign note-level priority:
- "high": explicit deadline, blocking work, urgent/ASAP language, named person waiting on them
- "medium": clear action needed but no time pressure
- "low": ideas, reference material, future thoughts, nothing actionable now

CLARIFICATION QUESTIONS
Only include when confidenceScore < 0.65. Write each so the user can answer in a word or phrase. Max 3. If clarification history already answers something, ask only what is still unresolved. Examples: "Which project is this for?", "Is this a task or an idea?", "Who is this assigned to?"

ENTITY RULES
- PERSON: real people’s first name or full name only
- PROJECT: match known projects first; create new only if clearly named in the note
- APP: specific software tools or platforms
- COMPANY: named organisations, clients, employers
- PLACE: physical locations
- TOPIC: recurring conceptual threads worth tracking (e.g., "pricing strategy", "onboarding", "tech debt")
Do not extract generic nouns. Quality over quantity.

CONFIDENCE THRESHOLDS
- 0.85–1.0: intent unambiguous, project known, all fields high quality
- 0.65–0.84: reasonable inference; user should review
- 0.0–0.64: ambiguous; must include clarificationQuestions

Return strict JSON:
{
  "title": "string",
  "summary": "string",
  "intent": "string",
  "nextAction": "string | null",
  "priority": "high | medium | low",
  "category": "string",
  "type": "TASK | IDEA | NOTE | REFERENCE | DECISION",
  "tags": ["string"],
  "suggestedProject": "string | null",
  "extractedTasks": [{"text": "string", "dueDate": "string | null", "priority": "high | medium | low"}],
  "extractedDates": ["string"],
  "extractedEntities": [{"type": "PERSON | PROJECT | APP | COMPANY | PLACE | TOPIC", "name": "string"}],
  "clarificationQuestions": ["string"],
  "confidenceScore": 0.0
}`;

interface OrganizeNoteOptions {
  userContext?: string;
  explicitProject?: string;
  explicitContext?: string;
  clarificationContext?: string;
  clarificationQuestionStats?: ClarificationQuestionStat[];
}

export interface SynthesisNoteInput {
  id: string;
  title: string | null;
  summary: string | null;
  rawContent: string;
  category: string | null;
  suggestedProject: string | null;
  createdAt: string;
}

export interface SynthesizedNotesPayload {
  title: string;
  summary: string;
  themes: string[];
  actions: string[];
  openQuestions: string[];
  dominantProject: string | null;
  dominantCategory: string | null;
  plan: {
    objective: string;
    firstMove: string;
    steps: Array<{
      title: string;
      detail: string;
      horizon: "now" | "next" | "later";
    }>;
    risks: string[];
    successSignal: string;
  };
  noteCount: number;
  sourceNoteIds: string[];
}

interface SynthesizeNotesOptions {
  planningGoal?: string;
}

/** Build compact guidance so the model avoids question styles the user repeatedly dismisses. */
function buildClarificationFeedbackHints(stats?: ClarificationQuestionStat[]): string[] {
  if (!stats || stats.length === 0) {
    return [];
  }

  const dismissed = stats
    .filter((stat) => getClarificationQuestionNoiseAssessment(stat).level !== "normal")
    .slice(0, 3)
    .map((stat) => `${stat.label} (${stat.dismisses} dismisses, ${stat.answers} answers, ${stat.restores} restores)`);
  const answered = stats
    .filter((stat) => stat.answers + stat.restores > stat.dismisses)
    .slice(0, 3)
    .map((stat) => `${stat.label} (${stat.answers} answers, ${stat.restores} restores)`);

  const hints: string[] = [];

  if (dismissed.length > 0) {
    hints.push(`Avoid repeating these low-value clarification styles unless they are truly necessary: ${dismissed.join("; ")}`);
  }

  if (answered.length > 0) {
    hints.push(`These clarification styles have historically been useful: ${answered.join("; ")}`);
  }

  return hints;
}

/**
 * Build supplemental hints to guide AI organization with user context.
 */
function buildOrganizationHints(options?: OrganizeNoteOptions): string {
  if (!options) {
    return "";
  }

  const hints: string[] = [];

  if (options.explicitProject?.trim()) {
    hints.push(`Explicit project hint: ${options.explicitProject.trim()}`);
  }

  if (options.explicitContext?.trim()) {
    hints.push(`Explicit context hint: ${options.explicitContext.trim()}`);
  }

  if (options.userContext?.trim()) {
    hints.push("User memory profile:");
    hints.push(options.userContext.trim());
  }

  if (options.clarificationContext?.trim()) {
    hints.push(options.clarificationContext.trim());
  }

  const clarificationFeedbackHints = buildClarificationFeedbackHints(options.clarificationQuestionStats);
  if (clarificationFeedbackHints.length > 0) {
    hints.push("Clarification feedback profile:");
    hints.push(...clarificationFeedbackHints);
  }

  if (hints.length === 0) {
    return "";
  }

  return `\n\nUse these hints while organizing:\n${hints.join("\n")}`;
}

/**
 * Organize a raw note using AI
 * Generates title, summary, category, tags, extracted tasks, entities, etc.
 */
export async function organizeNote(rawContent: string, options?: OrganizeNoteOptions) {
  try {
    if (!openaiClient) {
      const fallback = {
        title: rawContent.split("\n")[0]?.slice(0, 80) || "Untitled note",
        summary: "",
        intent: "Unable to determine intent without AI.",
        nextAction: null,
        priority: "medium" as const,
        category: "General",
        type: "NOTE" as const,
        tags: [],
        suggestedProject: undefined,
        extractedTasks: [],
        extractedDates: [],
        extractedEntities: [],
        clarificationQuestions: [],
        confidenceScore: 0.3,
      };

      return {
        ...fallback,
        summary: synthesizeStructuredSummary(rawContent, fallback),
      };
    }

    const completion = await openaiClient.chat.completions.create({
      model: "gpt-5.4",
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: ORGANIZE_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: `Organize this note:\n\n${rawContent}${buildOrganizationHints(options)}`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content || "{}";
    const parsed = OrganizedNoteSchema.parse(JSON.parse(raw));
    const improvedSummary = await improveSummaryIfNeeded(rawContent, parsed);
    const filteredClarificationQuestions = filterClarificationQuestionsByFeedback(
      parsed.clarificationQuestions,
      options?.clarificationQuestionStats || []
    );

    return {
      ...parsed,
      summary: improvedSummary,
      clarificationQuestions: filteredClarificationQuestions,
    };
  } catch (error) {
    console.error("Error organizing note:", error);
    throw new Error("Failed to organize note");
  }
}

/**
 * Split a messy mixed note into multiple coherent cards
 */
export async function splitNote(rawContent: string) {
  try {
    if (!openaiClient) {
      return {
        notes: [
          {
            content: rawContent,
            category: "General",
            type: "NOTE" as const,
            title: rawContent.split("\n")[0]?.slice(0, 80) || "Untitled note",
          },
        ],
        needsSplit: false,
      };
    }

    const completion = await openaiClient.chat.completions.create({
      model: "gpt-5.4",
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You analyze a raw note to determine if it contains multiple distinct, self-contained items that should be separate cards. Split only when topics or tasks are genuinely unrelated — not just multiple sub-tasks of the same effort. For each split note assign a specific actionable title. Return JSON: { needsSplit: boolean, notes: [{ title, content, category, type }] }",
        },
        {
          role: "user",
          content: `Analyze and split if needed:\n\n${rawContent}`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content || "{}";
    const parsed = SplitNotesSchema.parse(JSON.parse(raw));
    return parsed;
  } catch (error) {
    console.error("Error splitting note:", error);
    throw new Error("Failed to split note");
  }
}

/**
 * Synthesize a group of notes into one coherent overview and planning output.
 */
export async function synthesizeNotes(
  notes: SynthesisNoteInput[],
  options?: SynthesizeNotesOptions
): Promise<SynthesizedNotesPayload> {
  if (notes.length === 0) {
    return buildSynthesisFallback(notes);
  }

  if (!openaiClient) {
    return buildSynthesisFallback(notes);
  }

  try {
    const completion = await openaiClient.chat.completions.create({
      model: "gpt-5.4",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You synthesize multiple notes into one actionable overview and plan. Find the shared thread, collapse repeated work, and highlight the most important actions and unresolved questions. Also produce a concrete plan with objective, firstMove, ordered steps, risks, and a successSignal. If a planning lens is provided, treat it as authoritative. Return strict JSON with keys: title, summary, themes, actions, openQuestions, dominantProject, dominantCategory, plan.",
        },
        {
          role: "user",
          content: `Planning lens: ${options?.planningGoal?.trim() || "(none)"}\n\n${notes
            .map((note, index) => {
              return `${index + 1}. ${note.title || "Untitled note"}\nProject: ${note.suggestedProject || "(none)"}\nCategory: ${note.category || "(none)"}\nSummary: ${note.summary || "(none)"}\nBody: ${note.rawContent.slice(0, 500)}`;
            })
            .join("\n\n")}`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content || "{}";
    let parsed: z.infer<typeof SynthesizedNotesSchema>; // eslint-disable-line prefer-const
    const parseResult = SynthesizedNotesSchema.safeParse(JSON.parse(raw));
    if (!parseResult.success) {
      console.error("SynthesizedNotesSchema parse error:", parseResult.error.issues);
      return buildSynthesisFallback(notes);
    }
    parsed = parseResult.data;

    // Build a default plan if the AI omitted it
    const plan = parsed.plan ?? {
      objective: "Review the synthesized notes and define one clear next step.",
      firstMove: parsed.actions[0] || "Choose the most important action from the synthesis.",
      steps: [
        { title: "Clarify the goal", detail: "Decide what outcome matters most from these notes.", horizon: "now" as const },
        { title: "Take the first action", detail: parsed.actions[0] || "Execute on the top action.", horizon: "next" as const },
      ],
      risks: [],
      successSignal: "One concrete next step identified and underway.",
    };

    return {
      title: parsed.title,
      summary: parsed.summary,
      themes: parsed.themes,
      actions: parsed.actions,
      openQuestions: parsed.openQuestions,
      dominantProject: parsed.dominantProject || null,
      dominantCategory: parsed.dominantCategory || null,
      plan,
      noteCount: notes.length,
      sourceNoteIds: notes.map((note) => note.id),
    };
  } catch (error) {
    console.error("Error synthesizing notes:", error);
    return buildSynthesisFallback(notes);
  }
}

/**
 * Generate embeddings for notes (for semantic search and related notes)
 */
export async function embedNote(text: string): Promise<number[]> {
  try {
    if (!openaiClient) {
      return [];
    }

    const response = await openaiClient.embeddings.create({
      model: "text-embedding-3-large",
      dimensions: 1536,
      input: text,
    });

    return response.data[0]?.embedding ?? [];
  } catch (error) {
    console.error("Error embedding note:", error);
    throw new Error("Failed to embed note");
  }
}

/**
 * Generate embeddings for multiple texts in batch
 */
export async function embedNotes(texts: string[]): Promise<number[][]> {
  try {
    if (!openaiClient) {
      return texts.map(() => []);
    }

    const response = await openaiClient.embeddings.create({
      model: "text-embedding-3-large",
      dimensions: 1536,
      input: texts,
    });

    return response.data.map((item) => item.embedding);
  } catch (error) {
    console.error("Error embedding notes:", error);
    throw new Error("Failed to embed notes");
  }
}

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));

  if (magnitudeA === 0 || magnitudeB === 0) return 0;
  return dotProduct / (magnitudeA * magnitudeB);
}

/**
 * Parse extracted tasks from AI output
 */
export interface ExtractedTask {
  text: string;
  dueDate?: string | null;
  priority?: "high" | "medium" | "low";
  completed?: boolean;
}

/**
 * Parse extracted entities from AI output
 */
export interface ExtractedEntity {
  type: "PERSON" | "PROJECT" | "APP" | "COMPANY" | "PLACE" | "TOPIC";
  name: string;
}
