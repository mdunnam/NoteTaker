import type { ReviewActionStat, ReviewSuppressionKind } from "@/lib/userMemory";

export interface ReviewNoiseAssessment {
  noiseScore: number;
  penalty: number;
  level: "normal" | "downranked" | "suppressed";
}

export const REVIEW_NOISE_THRESHOLDS = {
  downranked: 2,
  suppressed: 5,
} as const;

/** Build a stable lookup key for review feedback stats. */
export function buildReviewActionKey(kind: ReviewSuppressionKind, id: string): string {
  return `${kind}:${id}`;
}

/** Convert a flat list of review feedback stats into a quick lookup map. */
export function buildReviewActionStatMap(actionStats: ReviewActionStat[] | undefined): Map<string, ReviewActionStat> {
  return new Map((actionStats || []).map((stat) => [buildReviewActionKey(stat.kind, stat.id), stat]));
}

/**
 * Convert user review feedback into a generic noise assessment.
 * Dismisses count more heavily than snoozes, while restores offset prior noise.
 */
export function getReviewNoiseAssessment(actionStat?: ReviewActionStat | null): ReviewNoiseAssessment {
  if (!actionStat) {
    return {
      noiseScore: 0,
      penalty: 0,
      level: "normal",
    };
  }

  const rawNoiseScore = actionStat.dismisses * 2 + actionStat.snoozes - actionStat.restores * 2;
  const noiseScore = Math.max(0, rawNoiseScore);

  if (noiseScore >= REVIEW_NOISE_THRESHOLDS.suppressed && actionStat.dismisses >= 2) {
    return {
      noiseScore,
      penalty: 999,
      level: "suppressed",
    };
  }

  if (noiseScore >= REVIEW_NOISE_THRESHOLDS.downranked) {
    return {
      noiseScore,
      penalty: noiseScore * 12,
      level: "downranked",
    };
  }

  return {
    noiseScore,
    penalty: 0,
    level: "normal",
  };
}