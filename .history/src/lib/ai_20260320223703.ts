import OpenAI from "openai";
import { z } from "zod";

const openaiClient = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

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
 * Organize a raw note using AI
 * Generates title, summary, category, tags, extracted tasks, entities, etc.
 */
export async function organizeNote(rawContent: string) {
  try {
    if (!openaiClient) {
      return {
        title: rawContent.split("\n")[0]?.slice(0, 80) || "Untitled note",
        summary: rawContent.slice(0, 200),
        category: "General",
        type: "NOTE" as const,
        tags: [],
        suggestedProject: undefined,
        extractedTasks: [],
        extractedDates: [],
        extractedEntities: [],
        confidenceScore: 0.3,
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
            "You are an expert note organizer. Return JSON matching this shape: { title, summary, category, type, tags, suggestedProject, extractedTasks, extractedDates, extractedEntities, confidenceScore }.",
        },
        {
          role: "user",
          content: `Organize this raw note:\n\n${rawContent}`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content || "{}";
    const parsed = OrganizedNoteSchema.parse(JSON.parse(raw));
    return parsed;
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
