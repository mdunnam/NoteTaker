/**
 * Daily Digest — AI-powered daily briefing.
 *
 * Reads all of the user's notes, entities, tasks, and relationships
 * and produces a structured briefing: open loops, upcoming events,
 * active projects, sparks from today, and "what did you mean?" items.
 */

import OpenAI from "openai";
import { z } from "zod";
import { prisma } from "@/lib/db";

const openaiClient = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

// ─── Schema ────────────────────────────────────────────────────────────────

const DigestItemSchema = z.object({
  id: z.string(),           // stable key for React
  text: z.string(),         // the headline line
  detail: z.string().optional(), // optional expanded context
  noteIds: z.array(z.string()).default([]),
  urgency: z.enum(["high", "medium", "low"]).default("medium"),
});

const DigestSectionSchema = z.object({
  key: z.string(),
  label: z.string(),
  emoji: z.string(),
  items: z.array(DigestItemSchema),
});

export const DigestContentSchema = z.object({
  greeting: z.string(),     // personalised opener
  summary: z.string(),      // 1-2 sentence "here's what's going on"
  sections: z.array(DigestSectionSchema),
  generatedAt: z.string(),  // ISO timestamp
});

export type DigestContent = z.infer<typeof DigestContentSchema>;
export type DigestSection = z.infer<typeof DigestSectionSchema>;
export type DigestItem = z.infer<typeof DigestItemSchema>;

// ─── Prompt ────────────────────────────────────────────────────────────────

const DIGEST_SYSTEM = `You are a sharp, warm personal chief of staff. You read everything your user has captured and produce a daily briefing that feels alive — not a mechanical list dump.

Your job: scan the notes, find the patterns, surface what matters today, and occasionally ask the small human question that needs asking ("Hey, you mentioned 'cheeseburgers' in your dump yesterday — dinner idea? App concept? Are you okay?").

SECTIONS to produce (only include a section if you have real content for it):

1. open_loops — Things someone is waiting on, or you haven't replied to. People mentioned with pending back-and-forth. Example: "David asked you about the redesign scope 2 days ago — have you responded?"

2. upcoming — Events, dates, deadlines extracted from notes. For interviews/meetings: suggest prep actions. If you see a resume mentioned with a meeting, offer to review it. Keep it concrete.

3. active_projects — For each project with recent note activity: one-line status + what the notes suggest should happen next.

4. today_sparks — Ideas or threads from the most recent note dumps that feel novel or worth developing. "Based on what you dumped today, I think there might be an app idea here: ..."

5. clarify — Genuinely ambiguous notes where you need to ask the human a specific question. Be direct and a little funny if the note warrants it. Max 3 items.

6. wins — If you see something completed or shipping, call it out. Optional section.

TONE RULES:
- Skip corporate filler. No "As your AI assistant..."
- Be direct, warm, occasionally witty. You've read everything. You know them.
- A greeting should feel personal to what's actually in their notes today.
- If nothing is happening: say so briefly and move on.
- Short items beat long explanations. Trust the user to click through to the note.

Return strict JSON matching this schema:
{
  "greeting": "string",
  "summary": "string",
  "sections": [
    {
      "key": "open_loops | upcoming | active_projects | today_sparks | clarify | wins",
      "label": "string (display label)",
      "emoji": "single emoji",
      "items": [
        {
          "id": "unique string",
          "text": "string — the headline, max ~100 chars",
          "detail": "string (optional) — extra context or suggestion",
          "noteIds": ["noteId1"],
          "urgency": "high | medium | low"
        }
      ]
    }
  ],
  "generatedAt": "ISO timestamp"
}`;

// ─── Generator ─────────────────────────────────────────────────────────────

export async function generateDailyDigest(userId: string): Promise<DigestContent> {
  // Pull everything we need in parallel
  const [recentNotes, allEntities, thinkingMemoryRow] = await Promise.all([
    prisma.note.findMany({
      where: { userId, isArchived: false, status: "PROCESSED" },
      orderBy: { createdAt: "desc" },
      take: 60,
      select: {
        id: true,
        title: true,
        summary: true,
        rawContent: true,
        category: true,
        type: true,
        priority: true,
        suggestedProject: true,
        extractedTasks: true,
        extractedDates: true,
        extractedEntities: true,
        aiMeta: true,
        createdAt: true,
        updatedAt: true,
        tags: true,
      },
    }),
    prisma.entity.findMany({
      where: { userId },
      include: {
        notes: {
          include: { note: { select: { id: true, title: true, createdAt: true } } },
          orderBy: { lastMentioned: "desc" },
          take: 5,
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 40,
    }),
    prisma.userPreferences.findUnique({
      where: { userId },
      select: { thinkingMemory: true },
    }),
  ]);

  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];

  // Separate today's dumps from older notes
  const todayStart = new Date(todayStr + "T00:00:00Z");
  const todayNotes = recentNotes.filter((n) => new Date(n.createdAt) >= todayStart);
  const olderNotes = recentNotes.filter((n) => new Date(n.createdAt) < todayStart);

  // Build a compact context document for the AI
  const contextLines: string[] = [];

  contextLines.push(`=== TODAY'S DUMPS (${todayNotes.length} notes) ===`);
  for (const note of todayNotes) {
    contextLines.push(
      `[${note.id}] ${note.title || "Untitled"} | ${note.category || "?"} | ${note.type || "?"} | priority:${note.priority || "?"}\n  Summary: ${note.summary || note.rawContent.slice(0, 200)}`
    );
    const tasks = Array.isArray(note.extractedTasks) ? note.extractedTasks : [];
    if (tasks.length > 0) {
      contextLines.push(`  Tasks: ${tasks.map((t: {text:string}) => t.text).join("; ")}`);
    }
    const dates = Array.isArray(note.extractedDates) ? note.extractedDates : [];
    if (dates.length > 0) {
      contextLines.push(`  Dates: ${dates.join(", ")}`);
    }
    const entities = Array.isArray(note.extractedEntities) ? note.extractedEntities : [];
    if (entities.length > 0) {
      contextLines.push(`  People/Projects: ${entities.map((e: {type:string;name:string}) => `${e.name}(${e.type})`).join(", ")}`);
    }
  }

  contextLines.push(`\n=== RECENT NOTES (last 30 days) ===`);
  for (const note of olderNotes.slice(0, 30)) {
    const daysAgo = Math.round((now.getTime() - new Date(note.createdAt).getTime()) / 86400000);
    contextLines.push(
      `[${note.id}] ${note.title || "Untitled"} | ${daysAgo}d ago | ${note.category || "?"} | priority:${note.priority || "?"}\n  Summary: ${note.summary || note.rawContent.slice(0, 150)}`
    );
    const tasks = Array.isArray(note.extractedTasks) ? note.extractedTasks : [];
    if (tasks.length > 0) {
      contextLines.push(`  Tasks: ${tasks.map((t: {text:string}) => t.text).join("; ")}`);
    }
    const dates = Array.isArray(note.extractedDates) ? note.extractedDates : [];
    if (dates.length > 0) {
      contextLines.push(`  Dates: ${dates.join(", ")}`);
    }
    const entities = Array.isArray(note.extractedEntities) ? note.extractedEntities : [];
    if (entities.length > 0) {
      contextLines.push(`  Entities: ${entities.map((e: {type:string;name:string}) => `${e.name}(${e.type})`).join(", ")}`);
    }
  }

  contextLines.push(`\n=== KNOWN PEOPLE & PROJECTS ===`);
  for (const entity of allEntities.slice(0, 20)) {
    const lastNote = entity.notes[0]?.note;
    const lastSeen = lastNote
      ? `last mentioned ${Math.round((now.getTime() - new Date(lastNote.createdAt).getTime()) / 86400000)}d ago`
      : "no recent mention";
    contextLines.push(`${entity.type} "${entity.name}" — ${entity.notes.length} mentions, ${lastSeen}`);
  }

  // Include user's known projects from thinkingMemory if available
  const memory = thinkingMemoryRow?.thinkingMemory as Record<string, unknown> | null;
  if (memory?.knownProjects) {
    contextLines.push(`\n=== USER'S KNOWN PROJECTS ===`);
    contextLines.push(JSON.stringify(memory.knownProjects));
  }

  if (memory?.identityAliases && Array.isArray(memory.identityAliases) && memory.identityAliases.length > 0) {
    contextLines.push(`\n=== USER'S OWN NAMES (never treat as other people) ===`);
    contextLines.push((memory.identityAliases as string[]).join(", "));
  }

  contextLines.push(`\n=== CURRENT DATE ===`);
  contextLines.push(now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" }));

  const contextDoc = contextLines.join("\n");

  if (!openaiClient) {
    return buildFallbackDigest(recentNotes, todayNotes, now);
  }

  try {
    const completion = await openaiClient.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: DIGEST_SYSTEM },
        { role: "user", content: contextDoc },
      ],
    });

    const raw = completion.choices[0]?.message?.content || "{}";
    const parsed = DigestContentSchema.parse(JSON.parse(raw));
    return parsed;
  } catch (err) {
    console.error("Digest generation failed:", err);
    return buildFallbackDigest(recentNotes, todayNotes, now);
  }
}

// ─── Persist / Retrieve ───────────────────────────────────────────────────

export async function getOrCreateDigest(userId: string, dateStr: string): Promise<DigestContent> {
  const existing = await prisma.dailyDigest.findUnique({
    where: { userId_date: { userId, date: dateStr } },
  });

  if (existing) {
    return DigestContentSchema.parse(existing.content);
  }

  const content = await generateDailyDigest(userId);

  await prisma.dailyDigest.upsert({
    where: { userId_date: { userId, date: dateStr } },
    update: { content: content as object, updatedAt: new Date() },
    create: { userId, date: dateStr, content: content as object, noteCount: 0 },
  });

  return content;
}

export async function regenerateDigest(userId: string, dateStr: string): Promise<DigestContent> {
  const content = await generateDailyDigest(userId);

  await prisma.dailyDigest.upsert({
    where: { userId_date: { userId, date: dateStr } },
    update: { content: content as object, updatedAt: new Date() },
    create: { userId, date: dateStr, content: content as object, noteCount: 0 },
  });

  return content;
}

// ─── Fallback ─────────────────────────────────────────────────────────────

function buildFallbackDigest(
  allNotes: { id: string; title: string | null; summary: string | null; createdAt: Date; priority: string | null }[],
  todayNotes: { id: string; title: string | null }[],
  now: Date
): DigestContent {
  const sections: DigestSection[] = [];

  if (todayNotes.length > 0) {
    sections.push({
      key: "today_sparks",
      label: "Today's Captures",
      emoji: "✨",
      items: todayNotes.slice(0, 5).map((n, i) => ({
        id: `today-${i}`,
        text: n.title || "Untitled note",
        noteIds: [n.id],
        urgency: "medium" as const,
      })),
    });
  }

  const highPriority = allNotes.filter((n) => n.priority === "high").slice(0, 3);
  if (highPriority.length > 0) {
    sections.push({
      key: "open_loops",
      label: "High Priority",
      emoji: "🔴",
      items: highPriority.map((n, i) => ({
        id: `hp-${i}`,
        text: n.title || "Untitled note",
        noteIds: [n.id],
        urgency: "high" as const,
      })),
    });
  }

  return {
    greeting: `Good ${now.getHours() < 12 ? "morning" : now.getHours() < 17 ? "afternoon" : "evening"}.`,
    summary: `You have ${allNotes.length} notes. ${todayNotes.length > 0 ? `${todayNotes.length} captured today.` : "Nothing new today yet."}`,
    sections,
    generatedAt: now.toISOString(),
  };
}
