/**
 * POST /api/voice/speak
 *
 * Accepts text (or a noteId) and returns an MP3 audio stream
 * synthesized by AWS Polly.
 *
 * Body (JSON):
 *   text    — text to speak (required if no noteId)
 *   noteId  — note ID to read aloud (optional, fetches note content)
 *   voiceId — optional Polly voice override (default: Joanna)
 */

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { synthesizeSpeech } from "@/lib/polly";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { text?: string; noteId?: string; voiceId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  let text = body.text?.trim();

  // If noteId provided, fetch note content
  if (!text && body.noteId) {
    const note = await prisma.note.findFirst({
      where: { id: body.noteId, userId: session.user.id },
      select: { title: true, rawContent: true },
    });

    if (!note) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    text = note.title ? `${note.title}. ${note.rawContent}` : note.rawContent;
  }

  if (!text) {
    return NextResponse.json({ error: "No text provided" }, { status: 400 });
  }

  try {
    const audioBuffer = await synthesizeSpeech({ text, voiceId: body.voiceId });

    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": audioBuffer.length.toString(),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("Polly TTS error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Speech synthesis failed" },
      { status: 500 }
    );
  }
}
