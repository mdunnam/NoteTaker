/**
 * POST /api/voice/transcribe
 *
 * Accepts an audio file upload, transcribes it with AWS Transcribe,
 * and creates a new note from the transcript.
 *
 * Form fields:
 *   audio        — audio file (required) — mp3, wav, webm, m4a, ogg
 *   projectHint  — optional project hint
 */

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { transcribeAudio } from "@/lib/transcribe";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300; // 5 min timeout for long recordings

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const audio = formData.get("audio") as File | null;
  if (!audio || !(audio instanceof File)) {
    return NextResponse.json({ error: "No audio file provided" }, { status: 400 });
  }

  const MAX_SIZE = 100 * 1024 * 1024; // 100 MB
  if (audio.size > MAX_SIZE) {
    return NextResponse.json({ error: "Audio file too large (max 100 MB)" }, { status: 400 });
  }

  const projectHint = (formData.get("projectHint") as string | null)?.trim() || undefined;

  try {
    const buffer = Buffer.from(await audio.arrayBuffer());

    const transcript = await transcribeAudio({
      userId: session.user.id,
      audioBuffer: buffer,
      filename: audio.name,
      mimeType: audio.type || "audio/mpeg",
    });

    if (!transcript.trim()) {
      return NextResponse.json({ error: "No speech detected in audio" }, { status: 422 });
    }

    // Derive a provisional title from the first ~60 chars of transcript
    const words = transcript.trim().split(/\s+/);
    let provisionalTitle = words.slice(0, 10).join(" ");
    if (words.length > 10) provisionalTitle += "…";
    provisionalTitle = provisionalTitle.slice(0, 80);

    // Create note from transcript
    const note = await prisma.note.create({
      data: {
        userId: session.user.id,
        rawContent: transcript,
        title: provisionalTitle,
        status: "PROCESSING",
        suggestedProject: projectHint ?? null,
        aiMeta: {
          captureMode: "voice",
          source: "aws-transcribe",
          originalFilename: audio.name,
        },
      },
    });

    // Enqueue AI enrichment
    await prisma.noteJob.create({ data: { noteId: note.id, userId: session.user.id } });
    const workerSecret = process.env.WORKER_SECRET;
    if (workerSecret) {
      void fetch(`${request.nextUrl.origin}/api/worker/enrich`, {
        method: "POST",
        headers: { Authorization: `Bearer ${workerSecret}` },
      }).catch(() => {});
    }

    return NextResponse.json({ noteId: note.id, transcript }, { status: 201 });
  } catch (err) {
    console.error("Transcription error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Transcription failed" },
      { status: 500 }
    );
  }
}
