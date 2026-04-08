/**
 * POST /api/import
 *
 * Accepts multipart/form-data with one or more files.
 * Extracts text from each file, runs AI split analysis, creates one note
 * per logical section, and enqueues enrichment for each.
 *
 * Form fields:
 *   files[]      — one or more File objects (required)
 *   projectHint  — optional project hint applied to all notes
 *   contextHint  — optional context hint applied to all notes
 */

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { parseFile } from "@/lib/fileParser";
import { splitNote } from "@/lib/ai";
import { NextRequest, NextResponse } from "next/server";

const MAX_FILES = 50;
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB per file

async function enqueueEnrichment(noteId: string, userId: string, origin: string) {
  await prisma.noteJob.create({ data: { noteId, userId } });
  const workerSecret = process.env.WORKER_SECRET;
  if (workerSecret) {
    void fetch(`${origin}/api/worker/enrich`, {
      method: "POST",
      headers: { Authorization: `Bearer ${workerSecret}` },
    }).catch((err: unknown) => {
      console.warn("Worker trigger failed (job is queued):", err);
    });
  }
}

/**
 * Derive a smart provisional title from raw text — used before AI enrichment
 * completes so notes never appear as "Untitled".
 */
function provisionalTitle(filename: string, content: string, splitTitle?: string): string {
  // If the AI gave us a title from split, use it
  if (splitTitle && splitTitle.trim() && splitTitle.trim().toLowerCase() !== "untitled") {
    return splitTitle.trim().slice(0, 80);
  }
  // Otherwise use the first non-empty line of content (trimmed)
  const firstLine = content.split("\n").map((l) => l.trim()).find((l) => l.length > 3);
  if (firstLine && firstLine.length <= 120) {
    return firstLine.slice(0, 80);
  }
  // Fall back to filename without extension
  return filename.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ").slice(0, 80);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart form data" }, { status: 400 });
  }

  const projectHint = (formData.get("projectHint") as string | null)?.trim() || undefined;
  const contextHint = (formData.get("contextHint") as string | null)?.trim() || undefined;

  const files = formData.getAll("files[]") as File[];
  if (!files || files.length === 0) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 });
  }

  const limited = files.slice(0, MAX_FILES);
  const results: Array<{ filename: string; noteIds?: string[]; error?: string }> = [];

  for (const file of limited) {
    if (!(file instanceof File)) {
      results.push({ filename: "unknown", error: "Not a valid file" });
      continue;
    }

    if (file.size > MAX_FILE_SIZE) {
      results.push({ filename: file.name, error: `File too large (max 50 MB)` });
      continue;
    }

    try {
      const parsed = await parseFile(file);

      if (!parsed.text.trim()) {
        results.push({ filename: file.name, error: "No text could be extracted" });
        continue;
      }

      // Run AI split analysis — breaks multi-topic content into distinct cards
      let splits: Array<{ title: string; content: string; category: string; type: string }>;
      try {
        const splitResult = await splitNote(parsed.text);
        splits = splitResult.needsSplit && splitResult.notes.length > 1
          ? splitResult.notes
          : [{ title: "", content: parsed.text, category: contextHint || "General", type: "NOTE" }];
      } catch {
        // If split fails, fall back to single note
        splits = [{ title: "", content: parsed.text, category: contextHint || "General", type: "NOTE" }];
      }

      const noteIds: string[] = [];

      for (const split of splits) {
        const rawContent = `[Imported from: ${parsed.filename}]\n\n${split.content}`;
        const title = provisionalTitle(file.name, split.content, split.title);

        const note = await prisma.note.create({
          data: {
            userId: session.user.id,
            rawContent,
            title,  // Set immediately — no more "Untitled" while enrichment runs
            status: "PROCESSING",
            category: split.category || contextHint || null,
            type: split.type || "NOTE",
            suggestedProject: projectHint ?? null,
            aiMeta: {
              captureMode: "import",
              importedFile: {
                name: file.name,
                type: file.type || "unknown",
                size: file.size,
              },
            },
          },
        });

        await enqueueEnrichment(note.id, session.user.id, request.nextUrl.origin);
        noteIds.push(note.id);
      }

      // Bust today's digest cache
      const todayStr = new Date().toISOString().split("T")[0];
      await prisma.dailyDigest.deleteMany({
        where: { userId: session.user.id, date: todayStr },
      }).catch(() => {});

      results.push({ filename: file.name, noteIds });
    } catch (err) {
      console.error(`Error importing file ${file.name}:`, err);
      results.push({
        filename: file.name,
        error: err instanceof Error ? err.message : "Failed to parse file",
      });
    }
  }

  const succeeded = results.filter((r) => r.noteIds && r.noteIds.length > 0);
  const failed = results.filter((r) => r.error);
  const totalNotes = succeeded.reduce((sum, r) => sum + (r.noteIds?.length ?? 0), 0);

  return NextResponse.json(
    {
      imported: succeeded.length,
      totalNotes,
      failed: failed.length,
      results,
    },
    { status: 201 }
  );
}
