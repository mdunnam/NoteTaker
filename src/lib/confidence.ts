export type ConfidenceState = "auto-applied" | "suggested" | "review";

export interface ConfidenceBadgeConfig {
  label: string;
  className: string;
}

/**
 * Classify AI confidence into trust tiers used by the UI.
 */
export function getConfidenceState(score: number | null | undefined): ConfidenceState {
  const normalized = score ?? 0;

  if (normalized >= 0.8) {
    return "auto-applied";
  }

  if (normalized >= 0.55) {
    return "suggested";
  }

  return "review";
}

/**
 * Return display metadata for confidence-aware badges.
 */
export function getConfidenceBadgeConfig(score: number | null | undefined): ConfidenceBadgeConfig {
  const state = getConfidenceState(score);

  if (state === "auto-applied") {
    return {
      label: "Auto-applied",
      className: "bg-green-100 text-green-800",
    };
  }

  if (state === "suggested") {
    return {
      label: "Suggested",
      className: "bg-amber-100 text-amber-800",
    };
  }

  return {
    label: "Needs review",
    className: "bg-red-100 text-red-800",
  };
}
