import { openai } from "@ai-sdk/openai";
import { generateObject, generateText, embedMany } from "ai";
import { z } from "zod";

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
    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      system: `You are an expert note organizer. Your job is to analyze a raw note dump and extract structure from it.
      
Be precise but confident. If unsure about something, make a reasonable inference and set confidenceScore lower.
Extract real tasks only (things with actionable items).
Detect people, projects, topics, and apps mentioned.
Suggest a practical category and type.`,
      prompt: `Organize this raw note:\n\n${rawContent}`,
      schema: OrganizedNoteSchema,
    });

    return object;
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
    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      system: `You are an expert at breaking apart messy note dumps into coherent individual cards.
      
Look for natural boundaries:
- Different topics
- Different projects/people
- Tasks vs ideas vs reference info
- Different time horizons (today vs later)

If the note is already coherent, return needsSplit: false.
Only split if it genuinely has 2+ distinct items.`,
      prompt: `Analyze and split if needed:\n\n${rawContent}`,
      schema: SplitNotesSchema,
    });

    return object;
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
    const response = await openai.embedding({
      model: "text-embedding-3-small",
      value: text,
    });

    return response.embedding;
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
    const embeddings = await embedMany({
      model: openai.embedding("text-embedding-3-small"),
      values: texts,
    });

    return embeddings.embeddings;
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
