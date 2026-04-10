/**
 * POST /api/import
 *
 * Accepts multipart/form-data with one or more files.
 * Extracts full text from each file, applies header-aware chunking
 * (H1 → H2 → H3 → paragraphs), creates one note per chunk,
 * archives the original to S3, and enqueues AI enrichment for each.
 *
 * Form fields:
 *   files[]      — one or more File objects (required)
 *   projectHint  — optional project hint applied to all notes
 *   contextHint  — optional context hint applied to all notes
 */

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { parseFile } from "@/lib/fileParser";
import { chunkDocument } from "@/lib/chunkDocument";
import { uploadToS3, buildImportKey } from "@/lib/s3";
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
 * Derive a smart provisional title — used before AI enrichment completes
 * so notes never appear as "Untitled".
 */
function provisionalTitle(filename: string, content: string, chunkTitle?: string): string {
  if (chunkTitle && chunkTitle.trim() && chunkTitle.trim().toLowerCase() !== "untitled") {
    return chunkTitle.trim().slice(0, 80);
  }
  const firstLine = content.split("\n").map((l) => l.trim()).find((l) => l.length > 3);
  if (firstLine && firstLine.length <= 120) return firstLine.slice(0, 80);
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
  const results: Array<{ filename: string; noteIds?: string[]; chunks?: number; error?: string }> = [];

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

      // Archive original file to S3 (non-fatal)
      let s3Key: string | undefined;
      try {
        const buffer = Buffer.from(await file.arrayBuffer());
        s3Key = buildImportKey(session.user.id, file.name);
        await uploadToS3({
          key: s3Key,
          body: buffer,
          contentType: file.type || "application/octet-stream",
          metadata: { userId: session.user.id, originalName: file.name },
        });
      } catch (s3Err) {
        console.warn(`S3 upload failed for ${file.name}:`, s3Err);
        s3Key = undefined;
      }

      // Header-aware chunking: H1 → H2 → H3 → paragraphs
      const chunks = chunkDocument(parsed.text, parsed.filename);
      const noteIds: string[] = [];

      for (const chunk of chunks) {
        const rawContent = `[Imported from: ${parsed.filename}]\n\n${chunk.content}`;
        const title = provisionalTitle(file.name, chunk.content, chunk.title);

        const note = await prisma.note.create({
          data: {
            userId: session.user.id,
            rawContent,
            title,
            status: "PROCESSING",
            category: contextHint || null,
            type: "NOTE",
            suggestedProject: projectHint ?? null,
            aiMeta: {
              captureMode: "import",
              importedFile: {
                name: file.name,
                type: file.type || "unknown",
                size: file.size,
                s3Key: s3Key ?? null,
                totalChunks: chunks.length,
                chunkIndex: noteIds.length,
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

      results.push({ filename: file.name, noteIds, chunks: chunks.length });
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
    { imported: succeeded.length, totalNotes, failed: failed.length, results },
    { status: 201 }
  );
}
