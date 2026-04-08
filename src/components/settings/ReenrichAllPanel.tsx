"use client";

import { useState } from "react";

export default function ReenrichAllPanel() {
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [queued, setQueued] = useState(0);
  const [confirmed, setConfirmed] = useState(false);

  async function handleReenrich() {
    setStatus("running");
    try {
      const res = await fetch("/api/notes/reenrich-all", { method: "POST" });
      const data = await res.json();
      setQueued(data.queued ?? 0);
      setStatus("done");
      setConfirmed(false);
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-gray-800">Re-enrich All Notes</h3>
        <p className="mt-1 text-xs text-gray-500">
          Runs the full AI pipeline on every note from scratch — useful after updating your identity aliases, a prompt upgrade, or when classifications feel off. The worker processes notes in the background; large libraries may take a few minutes.
        </p>
      </div>

      {status === "done" && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-2.5 text-sm text-green-800">
          ✓ {queued} note{queued === 1 ? "" : "s"} queued for re-enrichment. Processing in background.
        </div>
      )}

      {status === "error" && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-800">
          Something went wrong. Try again.
        </div>
      )}

      {status !== "done" && (
        !confirmed ? (
          <button
            onClick={() => setConfirmed(true)}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Re-enrich all notes…
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500">This will re-process every note. Continue?</span>
            <button
              onClick={handleReenrich}
              disabled={status === "running"}
              className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50 transition-colors"
            >
              {status === "running" ? "Queuing…" : "Yes, re-enrich all"}
            </button>
            <button
              onClick={() => setConfirmed(false)}
              className="text-sm text-gray-400 hover:text-gray-600"
            >
              Cancel
            </button>
          </div>
        )
      )}
    </div>
  );
}
