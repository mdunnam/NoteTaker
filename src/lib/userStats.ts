import { prisma } from "@/lib/db";
import { getHintStats } from "@/lib/userMemory";

export interface MetricTrend {
  last7: number;
  last30: number;
  delta: number;
  direction: "up" | "down" | "flat";
  betterWhen: "higher" | "lower";
}

interface UserStatsTrends {
  confidence: MetricTrend;
  clarificationRate: MetricTrend;
  resolutionTimeMs: MetricTrend;
}

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
  trends: UserStatsTrends;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function buildTrend(last7: number, last30: number, betterWhen: "higher" | "lower"): MetricTrend {
  const delta = last7 - last30;
  const direction = Math.abs(delta) < 0.0001 ? "flat" : delta > 0 ? "up" : "down";
  return {
    last7,
    last30,
    delta,
    direction,
    betterWhen,
  };
}

/**
 * Build user-level instrumentation stats for AI quality and workflow health.
 */
export async function getUserStats(userId: string): Promise<UserStats> {
  const now = Date.now();
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

  const [
    totalNotes,
    processedNotes,
    stillProcessing,
    failedJobs,
    lowConfidenceNotes,
    processedConfidenceRows,
    doneJobs,
    trendNotes,
    trendJobs,
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
    prisma.note.findMany({
      where: {
        userId,
        isArchived: false,
        status: "PROCESSED",
        updatedAt: { gte: thirtyDaysAgo },
        confidenceScore: { not: null },
      },
      select: {
        updatedAt: true,
        confidenceScore: true,
      },
      take: 2000,
      orderBy: {
        updatedAt: "desc",
      },
    }),
    prisma.noteJob.findMany({
      where: {
        userId,
        status: "DONE",
        processedAt: { gte: thirtyDaysAgo },
      },
      select: {
        processedAt: true,
        note: {
          select: {
            createdAt: true,
          },
        },
      },
      take: 2000,
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

  const avgTimeToResolutionMs = average(resolutionDurations);

  const notesLast7 = trendNotes.filter((note) => note.updatedAt >= sevenDaysAgo);
  const notesLast30 = trendNotes;
  const lowConfLast7 = notesLast7.filter((note) => (note.confidenceScore || 0) < 0.65).length;
  const lowConfLast30 = notesLast30.filter((note) => (note.confidenceScore || 0) < 0.65).length;

  const confidenceTrend = buildTrend(
    average(notesLast7.map((note) => note.confidenceScore || 0)),
    average(notesLast30.map((note) => note.confidenceScore || 0)),
    "higher"
  );

  const clarificationTrend = buildTrend(
    notesLast7.length > 0 ? lowConfLast7 / notesLast7.length : 0,
    notesLast30.length > 0 ? lowConfLast30 / notesLast30.length : 0,
    "lower"
  );

  const trendDurationsLast7 = trendJobs
    .filter((job) => !!job.processedAt && job.processedAt >= sevenDaysAgo)
    .map((job) => {
      const processedAt = job.processedAt as Date;
      return processedAt.getTime() - job.note.createdAt.getTime();
    })
    .filter((ms) => ms >= 0);

  const trendDurationsLast30 = trendJobs
    .filter((job) => !!job.processedAt)
    .map((job) => {
      const processedAt = job.processedAt as Date;
      return processedAt.getTime() - job.note.createdAt.getTime();
    })
    .filter((ms) => ms >= 0);

  const resolutionTrend = buildTrend(
    average(trendDurationsLast7),
    average(trendDurationsLast30),
    "lower"
  );

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
    trends: {
      confidence: confidenceTrend,
      clarificationRate: clarificationTrend,
      resolutionTimeMs: resolutionTrend,
    },
  };
}
