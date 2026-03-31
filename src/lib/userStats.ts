import { prisma } from "@/lib/db";
import { getHintStats } from "@/lib/userMemory";

export interface UserStats {
  totalNotes: number;
  processedNotes: number;
  stillProcessing: number;
  lowConfidenceCount: number;
  clarificationRate: number;
  clarificationConversionRate: number;
  avgConfidence: number;
  avgHintLift: number;
  hintUses: number;
  avgTimeToResolutionMs: number;
  failedJobs: number;
}

/**
 * Build user-level instrumentation stats for AI quality and workflow health.
 */
export async function getUserStats(userId: string): Promise<UserStats> {
  const [
    totalNotes,
    processedNotes,
    stillProcessing,
    failedJobs,
    lowConfidenceNotes,
    processedConfidenceRows,
    doneJobs,
    hintStats,
  ] = await Promise.all([
    prisma.note.count({ where: { userId, isArchived: false } }),
    prisma.note.count({ where: { userId, isArchived: false, status: "PROCESSED" } }),
    prisma.note.count({ where: { userId, status: "PROCESSING" } }),
    prisma.noteJob.count({ where: { userId, status: "FAILED" } }),
    prisma.note.count({
      where: {
        userId,
        isArchived: false,
        status: "PROCESSED",
        confidenceScore: { lt: 0.65 },
      },
    }),
    prisma.note.findMany({
      where: {
        userId,
        isArchived: false,
        status: "PROCESSED",
        confidenceScore: { not: null },
      },
      select: {
        confidenceScore: true,
      },
      take: 500,
      orderBy: {
        updatedAt: "desc",
      },
    }),
    prisma.noteJob.findMany({
      where: {
        userId,
        status: "DONE",
        processedAt: { not: null },
      },
      select: {
        processedAt: true,
        note: {
          select: {
            createdAt: true,
          },
        },
      },
      take: 500,
      orderBy: {
        processedAt: "desc",
      },
    }),
    getHintStats(userId),
  ]);

  const clarificationRate = processedNotes > 0 ? lowConfidenceNotes / processedNotes : 0;

  const totalHintUses = hintStats.reduce((sum, stat) => sum + stat.uses, 0);
  const clarificationConversionRate = lowConfidenceNotes > 0
    ? Math.min(1, totalHintUses / lowConfidenceNotes)
    : 0;

  const avgConfidence = processedConfidenceRows.length > 0
    ? processedConfidenceRows.reduce((sum, row) => sum + (row.confidenceScore || 0), 0) / processedConfidenceRows.length
    : 0;

  const avgHintLift = totalHintUses > 0
    ? hintStats.reduce((sum, stat) => sum + stat.totalConfidenceLift, 0) / totalHintUses
    : 0;

  const resolutionDurations = doneJobs
    .filter((job) => !!job.processedAt)
    .map((job) => {
      const processedAt = job.processedAt as Date;
      return processedAt.getTime() - job.note.createdAt.getTime();
    })
    .filter((ms) => ms >= 0);

  const avgTimeToResolutionMs = resolutionDurations.length > 0
    ? resolutionDurations.reduce((sum, ms) => sum + ms, 0) / resolutionDurations.length
    : 0;

  return {
    totalNotes,
    processedNotes,
    stillProcessing,
    lowConfidenceCount: lowConfidenceNotes,
    clarificationRate,
    clarificationConversionRate,
    avgConfidence,
    avgHintLift,
    hintUses: totalHintUses,
    avgTimeToResolutionMs,
    failedJobs,
  };
}
