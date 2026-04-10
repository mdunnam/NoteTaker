"use client";

/**
 * ReadAloudButton — speaks a note aloud using AWS Polly via /api/voice/speak.
 *
 * States: idle → loading → playing → error
 */

import { useState, useRef, useCallback } from "react";
import { Volume2, VolumeX, Loader2 } from "lucide-react";

interface Props {
  noteId?: string;
  text?: string;
  className?: string;
}

type PlayState = "idle" | "loading" | "playing" | "error";

export default function ReadAloudButton({ noteId, text, className = "" }: Props) {
  const [state, setState] = useState<PlayState>("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handleClick = useCallback(async () => {
    // If already playing, stop
    if (state === "playing") {
      audioRef.current?.pause();
      audioRef.current = null;
      setState("idle");
      return;
    }

    if (!noteId && !text) return;
    setState("loading");

    try {
      const res = await fetch("/api/voice/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(noteId ? { noteId } : { text }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Speech synthesis failed");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      const audio = new Audio(url);
      audioRef.current = audio;

      audio.onended = () => {
        setState("idle");
        URL.revokeObjectURL(url);
      };

      audio.onerror = () => {
        setState("error");
        URL.revokeObjectURL(url);
        setTimeout(() => setState("idle"), 3000);
      };

      await audio.play();
      setState("playing");
    } catch (err) {
      console.error("Read aloud error:", err);
      setState("error");
      setTimeout(() => setState("idle"), 3000);
    }
  }, [state, noteId, text]);

  if (state === "loading") {
    return (
      <button
        type="button"
        disabled
        className={`rounded-lg p-2 text-blue-500 ${className}`}
        title="Loading audio…"
      >
        <Loader2 className="h-4 w-4 animate-spin" />
      </button>
    );
  }

  if (state === "playing") {
    return (
      <button
        type="button"
        onClick={handleClick}
        className={`rounded-lg p-2 bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors ${className}`}
        title="Stop reading"
      >
        <VolumeX className="h-4 w-4" />
      </button>
    );
  }

  if (state === "error") {
    return (
      <button
        type="button"
        disabled
        className={`rounded-lg p-2 text-red-400 ${className}`}
        title="Audio error"
      >
        <VolumeX className="h-4 w-4" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`rounded-lg p-2 hover:bg-gray-100 text-gray-500 hover:text-blue-600 transition-colors ${className}`}
      title="Read note aloud"
    >
      <Volume2 className="h-4 w-4" />
    </button>
  );
}
