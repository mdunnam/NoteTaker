/**
 * POST /api/import
 *
 * Accepts multipart/form-data with one or more files.
 * Extracts text from each file server-side, creates one note per file,
 * and enqueues AI enrichment for each via the existing NoteJob pipeline.
 *
 * Form fields:
 *   files[]      — one or more File objects (required)
 *   projectHint  — optional project hint applied to all notes
 *   contextHint  — optional context hint applied to all notes
 */

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { parseFile } from "@/lib/fileParser";
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
  const results: Array<{ filename: string; noteId?: string; error?: string }> = [];

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

      // Prepend filename as context header so the AI knows what it's reading
      const rawContent = `[Imported from: ${parsed.filename}]\n\n${parsed.text}`;

      const note = await prisma.note.create({
        data: {
          userId: session.user.id,
          rawContent,
          status: "PROCESSING",
          suggestedProject: projectHint ?? null,
          category: contextHint ?? null,
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
      results.push({ filename: file.name, noteId: note.id });
    } catch (err) {
      console.error(`Error importing file ${file.name}:`, err);
      results.push({
        filename: file.name,
        error: err instanceof Error ? err.message : "Failed to parse file",
      });
    }
  }

  const succeeded = results.filter((r) => r.noteId);
  const failed = results.filter((r) => r.error);

  return NextResponse.json(
    {
      imported: succeeded.length,
      failed: failed.length,
      results,
    },
    { status: 201 }
  );
}
