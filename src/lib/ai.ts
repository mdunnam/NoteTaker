import OpenAI from "openai";
import { z } from "zod";

const openaiClient = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

type OrganizedNote = z.infer<typeof OrganizedNoteSchema>;

/**
 * Schema for organized note output from AI
 */
const OrganizedNoteSchema = z.object({
  title: z.string().describe("Auto-generated title based on content"),
  summary: z.string().describe("Brief summary of the note"),
  category: z.string().describe("Suggested category (e.g., Work, Personal, Project)"),
  type: z.enum(["TASK", "IDEA", "NOTE", "REFERENCE", "DECISION"]).describe("Type of note"),
  tags: z.array(z.string()).describe("Suggested tags"),
  suggestedProject: z.string().optional().describe("Project this might belong to"),
  extractedTasks: z
    .array(
      z.object({
        text: z.string(),
        dueDate: z.string().optional(),
      })
    )
    .describe("Tasks extracted from the note"),
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
  confidenceScore: z.number().min(0).max(1).describe("Confidence in the organization (0-1)"),
});

const SummaryRewriteSchema = z.object({
  summary: z.string().min(1).max(500),
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

/**
 * Rewrite weak summaries so they explain intent rather than echoing the raw note.
 */
async function improveSummaryIfNeeded(rawContent: string, organized: OrganizedNote): Promise<string> {
  if (!isWeakExtractiveSummary(rawContent, organized.summary)) {
    return organized.summary.trim();
  }

  if (!openaiClient) {
    return synthesizeStructuredSummary(rawContent, organized);
  }

  try {
    const completion = await openaiClient.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You rewrite weak note summaries. Produce one concise, interpretive summary sentence. Explain intent, context, and likely next action. Do not copy the source wording. Return JSON: { summary }.",
        },
        {
          role: "user",
          content: JSON.stringify({
            rawContent,
            weakSummary: organized.summary,
            category: organized.category,
            type: organized.type,
            extractedTasks: organized.extractedTasks,
            extractedEntities: organized.extractedEntities,
          }),
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content || "{}";
    const parsed = SummaryRewriteSchema.parse(JSON.parse(raw));
    const rewritten = parsed.summary.trim();

    if (!rewritten || isWeakExtractiveSummary(rawContent, rewritten)) {
      return synthesizeStructuredSummary(rawContent, organized);
    }

    return rewritten;
  } catch (error) {
    console.error("Error rewriting weak summary:", error);
    return synthesizeStructuredSummary(rawContent, organized);
  }
}

/**
 * Organize a raw note using AI
 * Generates title, summary, category, tags, extracted tasks, entities, etc.
 */
export async function organizeNote(rawContent: string) {
  try {
    if (!openaiClient) {
      const fallback = {
        title: rawContent.split("\n")[0]?.slice(0, 80) || "Untitled note",
        summary: "",
        category: "General",
        type: "NOTE" as const,
        tags: [],
        suggestedProject: undefined,
        extractedTasks: [],
        extractedDates: [],
        extractedEntities: [],
        confidenceScore: 0.3,
      };

      return {
        ...fallback,
        summary: synthesizeStructuredSummary(rawContent, fallback),
      };
    }

    const completion = await openaiClient.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are an expert note organizer for messy real-world notes. Return JSON matching this shape: { title, summary, category, type, tags, suggestedProject, extractedTasks, extractedDates, extractedEntities, confidenceScore }. Summary rules: be interpretive (not extractive), infer user intent/context, and include likely next action in 1-2 concise sentences. Task extraction rules: output explicit action-oriented tasks using imperative phrasing, normalize vague fragments into clear actions when reasonable, keep each task atomic, and only include dueDate when clearly implied or stated. Confidence rules: lower confidence when input is ambiguous or multi-topic.",
        },
        {
          role: "user",
          content: `Organize this raw note. If it is messy, decipher it into intent + actions:\n\n${rawContent}`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content || "{}";
    const parsed = OrganizedNoteSchema.parse(JSON.parse(raw));
    const improvedSummary = await improveSummaryIfNeeded(rawContent, parsed);

    return {
      ...parsed,
      summary: improvedSummary,
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
      model: "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Return JSON matching this shape: { notes: [{ content, category, type, title }], needsSplit }. Split only if there are truly separate ideas/tasks.",
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
 * Generate embeddings for notes (for semantic search and related notes)
 */
export async function embedNote(text: string): Promise<number[]> {
  try {
    if (!openaiClient) {
      return [];
    }

    const response = await openaiClient.embeddings.create({
      model: "text-embedding-3-small",
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
      model: "text-embedding-3-small",
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
  dueDate?: string;
  completed?: boolean;
}

/**
 * Parse extracted entities from AI output
 */
export interface ExtractedEntity {
  type: "PERSON" | "PROJECT" | "APP" | "COMPANY" | "PLACE" | "TOPIC";
  name: string;
}
