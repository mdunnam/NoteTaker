"use client";

/**
 * VoiceRecorder — mic button that records audio and sends it to
 * /api/voice/transcribe to create a new note automatically.
 *
 * States:
 *   idle → recording → uploading → done/error
 */

import { useState, useRef, useCallback } from "react";
import { Mic, MicOff, Loader2, CheckCircle, AlertCircle } from "lucide-react";

interface Props {
  onCreated?: (noteId: string, transcript: string) => void;
  projectHint?: string;
}

type RecordState = "idle" | "recording" | "uploading" | "done" | "error";

export default function VoiceRecorder({ onCreated, projectHint }: Props) {
  const [state, setState] = useState<RecordState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startRecording = useCallback(async () => {
    setErrorMsg(null);
    setSeconds(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Pick the best supported MIME type
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/mp4";

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        await uploadRecording(mimeType);
      };

      recorder.start(250); // collect in 250ms chunks
      setState("recording");

      // Timer
      timerRef.current = setInterval(() => {
        setSeconds((s) => {
          // Auto-stop after 5 minutes
          if (s >= 299) {
            stopRecording();
            return s;
          }
          return s + 1;
        });
      }, 1000);
    } catch (err) {
      setErrorMsg("Microphone access denied.");
      setState("error");
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    setState("uploading");
  }, []);

  const uploadRecording = async (mimeType: string) => {
    const ext = mimeType.includes("mp4") ? "m4a" : "webm";
    const blob = new Blob(chunksRef.current, { type: mimeType });
    const formData = new FormData();
    formData.append("audio", blob, `voice-note.${ext}`);
    if (projectHint) formData.append("projectHint", projectHint);

    try {
      const res = await fetch("/api/voice/transcribe", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Transcription failed");
      }

      const data = await res.json();
      setState("done");
      onCreated?.(data.noteId, data.transcript);

      // Reset after 3s
      setTimeout(() => setState("idle"), 3000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Upload failed");
      setState("error");
    }
  };

  const formatSeconds = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  if (state === "idle") {
    return (
      <button
        type="button"
        onClick={startRecording}
        className="rounded-md border border-gray-200 p-2 text-gray-500 hover:bg-red-50 hover:border-red-300 hover:text-red-600 transition-colors"
        title="Record voice note"
      >
        <Mic className="w-4 h-4" />
      </button>
    );
  }

  if (state === "recording") {
    return (
      <button
        type="button"
        onClick={stopRecording}
        className="flex items-center gap-1.5 rounded-md border border-red-400 bg-red-50 px-2.5 py-2 text-red-600 hover:bg-red-100 transition-colors animate-pulse"
        title="Stop recording"
      >
        <MicOff className="w-4 h-4" />
        <span className="text-xs font-mono font-medium">{formatSeconds(seconds)}</span>
      </button>
    );
  }

  if (state === "uploading") {
    return (
      <div className="flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-2 text-blue-600">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-xs font-medium">Transcribing…</span>
      </div>
    );
  }

  if (state === "done") {
    return (
      <div className="flex items-center gap-1.5 rounded-md border border-green-200 bg-green-50 px-2.5 py-2 text-green-700">
        <CheckCircle className="w-4 h-4" />
        <span className="text-xs font-medium">Note created!</span>
      </div>
    );
  }

  // error state
  return (
    <button
      type="button"
      onClick={() => setState("idle")}
      className="flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-2.5 py-2 text-red-700"
      title={errorMsg ?? "Error"}
    >
      <AlertCircle className="w-4 h-4" />
      <span className="text-xs font-medium truncate max-w-[120px]">{errorMsg ?? "Error"}</span>
    </button>
  );
}
