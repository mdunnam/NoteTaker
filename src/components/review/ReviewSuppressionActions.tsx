"use client";

import type { ReviewSuppressionKind } from "@/lib/userMemory";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface ReviewSuppressionActionsProps {
  kind: ReviewSuppressionKind;
  targetId: string;
  label?: string;
  actions?: Array<"snooze" | "dismiss" | "restore">;
}

/**
 * Persist snooze or dismiss actions for a review item, then refresh the review page.
 */
export default function ReviewSuppressionActions({
  kind,
  targetId,
  label,
  actions = ["snooze", "dismiss"],
}: ReviewSuppressionActionsProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const submitAction = async (action: "snooze" | "dismiss" | "restore") => {
    setIsSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch("/api/review/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, targetId, action, label }),
      });

      if (!response.ok) {
        throw new Error("Failed to update review state");
      }

      setMessage(
        action === "snooze"
          ? "Snoozed for 7 days."
          : action === "dismiss"
            ? "Dismissed for 30 days."
            : "Restored to the queue."
      );
      router.refresh();
    } catch (error) {
      console.error("Error updating review state:", error);
      setMessage("Could not update review state.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mt-3 flex items-center gap-2">
      {actions.includes("snooze") && (
        <button
          type="button"
          onClick={() => void submitAction("snooze")}
          disabled={isSubmitting}
          className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
        >
          Snooze 7d
        </button>
      )}
      {actions.includes("dismiss") && (
        <button
          type="button"
          onClick={() => void submitAction("dismiss")}
          disabled={isSubmitting}
          className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
        >
          Dismiss 30d
        </button>
      )}
      {actions.includes("restore") && (
        <button
          type="button"
          onClick={() => void submitAction("restore")}
          disabled={isSubmitting}
          className="rounded-md border border-blue-300 bg-white px-2.5 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-60"
        >
          Restore
        </button>
      )}
      {message && <span className="text-[11px] text-gray-600">{message}</span>}
    </div>
  );
}