import { prisma } from "@/lib/db";

export interface MemoryRecord {
  id: string;
  content: string;
  category: string;
  importance: number;
}

// Pull the memories Nero should always have in context.
// High-importance always; plus most recent of the rest, capped.
export async function getActiveMemories(userId: string, limit = 40): Promise<MemoryRecord[]> {
  const memories = await prisma.memory.findMany({
    where: { userId },
    orderBy: [{ importance: "desc" }, { updatedAt: "desc" }],
    take: limit,
  });
  return memories.map((m) => ({ id: m.id, content: m.content, category: m.category, importance: m.importance }));
}

export function formatMemoriesForPrompt(memories: MemoryRecord[]): string {
  if (memories.length === 0) return "Nothing learned yet — pay attention and remember what matters.";
  const byCat: Record<string, string[]> = {};
  for (const m of memories) {
    (byCat[m.category] ??= []).push(m.content);
  }
  return Object.entries(byCat)
    .map(([cat, items]) => `${cat}:\n${items.map((i) => `  - ${i}`).join("\n")}`)
    .join("\n");
}

// Dedupe-ish add: skip if a near-identical memory already exists
export async function addMemory(
  userId: string,
  content: string,
  opts: { category?: string; importance?: number; source?: string } = {}
): Promise<{ added: boolean; id?: string }> {
  const trimmed = content.trim();
  if (!trimmed) return { added: false };

  const existing = await prisma.memory.findMany({ where: { userId }, select: { content: true } });
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
  const target = norm(trimmed);
  if (existing.some((e) => norm(e.content) === target)) {
    return { added: false };
  }

  const m = await prisma.memory.create({
    data: {
      userId,
      content: trimmed,
      category: opts.category ?? "general",
      importance: opts.importance ?? 3,
      source: opts.source ?? "chat",
    },
  });
  return { added: true, id: m.id };
}

export async function listMemories(userId: string): Promise<MemoryRecord[]> {
  const memories = await prisma.memory.findMany({
    where: { userId },
    orderBy: [{ category: "asc" }, { importance: "desc" }],
  });
  return memories.map((m) => ({ id: m.id, content: m.content, category: m.category, importance: m.importance }));
}

export async function forgetMemory(id: string): Promise<void> {
  await prisma.memory.delete({ where: { id } }).catch(() => {});
}