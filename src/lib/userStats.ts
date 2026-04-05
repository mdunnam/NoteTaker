import { prisma } from "@/lib/db";
import { getClarificationQuestionNoiseAssessment } from "@/lib/clarification";
import { getThinkingMemory } from "@/lib/userMemory";

export interface MetricTrend {
  last7: number;
  last30: number;
  delta: number;
  direction: "up" | "down" | "flat";
  betterWhen: "higher" | "lower";
}

export interface MetricSeriesPoint {
  date: string;
  value: number;
}

interface UserStatsTrends {
  confidence: MetricTrend;
  clarificationRate: MetricTrend;
  clarificationDismissRate: MetricTrend;
  resolutionTimeMs: MetricTrend;
}

interface UserStatsHistory {
  confidence: MetricSeriesPoint[];
  clarificationRate: MetricSeriesPoint[];
  clarificationDismissRate: MetricSeriesPoint[];
  resolutionTimeMs: MetricSeriesPoint[];
}

interface SnapshotRow {
  snapshotDate: Date;
  avgConfidence: number;
  clarificationRate: number;
  avgTimeToResolutionMs: number;
}

const snapshotClient = prisma as typeof prisma & {
  userMetricSnapshot: {
    upsert: (args: unknown) => Promise<unknown>;
    findMany: (args: unknown) => Promise<SnapshotRow[]>;
  };
};

export interface UserStats {
  totalNotes: number;
  processedNotes: number;
  stillProcessing: number;
  lowConfidenceCount: number;
  clarificationRate: number;
  clarificationConversionRate: number;
  clarificationDismissRate: number;
  clarificationFeedbackCount: number;
  clarificationDownrankedStyles: number;
  clarificationSuppressedStyles: number;
  avgConfidence: number;
  avgHintLift: number;
  hintUses: number;
  avgTimeToResolutionMs: number;
  failedJobs: number;
  trends: UserStatsTrends;
  history: UserStatsHistory;
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

function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function endOfDay(value: Date): Date {
  const day = startOfDay(value);
  return new Date(day.getTime() + 24 * 60 * 60 * 1000 - 1);
}

function buildClarificationDismissRateHistory(
  events: Array<{ createdAt: string; action: "answered" | "dismissed" | "restored" }>,
  now: Date,
  days = 30
): MetricSeriesPoint[] {
  const today = startOfDay(now);
  const firstDay = startOfDay(new Date(today.getTime() - (days - 1) * 24 * 60 * 60 * 1000));

  return Array.from({ length: days }, (_, index) => {
    const day = startOfDay(new Date(firstDay.getTime() + index * 24 * 60 * 60 * 1000));
    const nextDay = new Date(day.getTime() + 24 * 60 * 60 * 1000);
    const dayEvents = events.filter((event) => {
      const createdAt = new Date(event.createdAt);
      return createdAt >= day && createdAt < nextDay;
    }).filter((event) => event.action === "answered" || event.action === "dismissed");
    const dismisses = dayEvents.filter((event) => event.action === "dismissed").length;

    return {
      date: day.toISOString(),
      value: dayEvents.length > 0 ? dismisses / dayEvents.length : 0,
    };
  });
}

function buildClarificationDismissRate(
  events: Array<{ createdAt: string; action: "answered" | "dismissed" | "restored" }>,
  windowStart?: Date
): number {
  const filteredEvents = (windowStart
    ? events.filter((event) => new Date(event.createdAt) >= windowStart)
    : events).filter((event) => event.action === "answered" || event.action === "dismissed");
  const dismisses = filteredEvents.filter((event) => event.action === "dismissed").length;

  return filteredEvents.length > 0 ? dismisses / filteredEvents.length : 0;
}

async function buildSnapshotValuesForDate(userId: string, snapshotDate: Date): Promise<SnapshotRow> {
  const dayStart = startOfDay(snapshotDate);
  const dayEnd = endOfDay(snapshotDate);
  const windowStart = startOfDay(new Date(dayStart.getTime() - 29 * 24 * 60 * 60 * 1000));

  const [notes, jobs] = await Promise.all([
    prisma.note.findMany({
      where: {
        userId,
        isArchived: false,
        status: "PROCESSED",
        updatedAt: {
          gte: windowStart,
          lte: dayEnd,
        },
        confidenceScore: { not: null },
      },
      select: {
        confidenceScore: true,
      },
      take: 3000,
      orderBy: {
        updatedAt: "desc",
      },
    }),
    prisma.noteJob.findMany({
      where: {
        userId,
        status: "DONE",
        processedAt: {
          gte: windowStart,
          lte: dayEnd,
        },
      },
      select: {
        processedAt: true,
        note: {
          select: {
            createdAt: true,
          },
        },
      },
      take: 3000,
      orderBy: {
        processedAt: "desc",
      },
    }),
  ]);

  const avgConfidence = average(notes.map((note) => note.confidenceScore || 0));
  const lowConfidenceCount = notes.filter((note) => (note.confidenceScore || 0) < 0.65).length;
  const clarificationRate = notes.length > 0 ? lowConfidenceCount / notes.length : 0;
  const avgTimeToResolutionMs = average(
    jobs
      .filter((job) => !!job.processedAt)
      .map((job) => {
        const processedAt = job.processedAt as Date;
        return processedAt.getTime() - job.note.createdAt.getTime();
      })
      .filter((ms) => ms >= 0)
  );

  return {
    snapshotDate: dayStart,
    avgConfidence,
    clarificationRate,
    avgTimeToResolutionMs,
  };
}

/** Upsert a single daily metric snapshot for a user. Throws if the table is missing — callers should wrap in try/catch. */
export async function upsertUserMetricSnapshotForDate(userId: string, snapshotDate: Date): Promise<void> {
  const values = await buildSnapshotValuesForDate(userId, snapshotDate);

  await snapshotClient.userMetricSnapshot.upsert({
    where: {
      userId_snapshotDate: {
        userId,
        snapshotDate: values.snapshotDate,
      },
    },
    create: {
      userId,
      snapshotDate: values.snapshotDate,
      avgConfidence: values.avgConfidence,
      clarificationRate: values.clarificationRate,
      avgTimeToResolutionMs: values.avgTimeToResolutionMs,
    },
    update: {
      avgConfidence: values.avgConfidence,
      clarificationRate: values.clarificationRate,
      avgTimeToResolutionMs: values.avgTimeToResolutionMs,
    },
  });
}

/** Backfill missing daily snapshots for the last N days for a single user. */
export async function ensureRecentUserMetricSnapshots(userId: string, days = 30): Promise<number> {
  const today = startOfDay(new Date());
  const oldest = startOfDay(new Date(today.getTime() - (days - 1) * 24 * 60 * 60 * 1000));

  const existing = await snapshotClient.userMetricSnapshot.findMany({
    where: {
      userId,
      snapshotDate: { gte: oldest },
    },
    select: {
      snapshotDate: true,
      avgConfidence: true,
      clarificationRate: true,
      avgTimeToResolutionMs: true,
    },
    orderBy: {
      snapshotDate: "asc",
    },
    take: days,
  });

  const existingKeys = new Set(existing.map((snapshot) => snapshot.snapshotDate.toISOString()));
  const datesToCreate: Date[] = [];

  for (let index = 0; index < days; index += 1) {
    const current = startOfDay(new Date(oldest.getTime() + index * 24 * 60 * 60 * 1000));
    const key = current.toISOString();
    if (!existingKeys.has(key)) {
      datesToCreate.push(current);
    }
  }

  for (const date of datesToCreate) {
    await upsertUserMetricSnapshotForDate(userId, date);
  }

  return datesToCreate.length;
}

/** Backfill recent metric snapshots for all users, suitable for cron/worker use. */
export async function backfillRecentMetricSnapshotsForAllUsers(days = 30): Promise<{
  usersProcessed: number;
  snapshotsCreated: number;
}> {
  const users = await prisma.user.findMany({
    select: { id: true },
  });

  let snapshotsCreated = 0;

  for (const user of users) {
    snapshotsCreated += await ensureRecentUserMetricSnapshots(user.id, days);
  }

  return {
    usersProcessed: users.length,
    snapshotsCreated,
  };
}

/**
 * Build user-level instrumentation stats for AI quality and workflow health.
 */
export async function getUserStats(userId: string): Promise<UserStats> {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

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
    thinkingMemory,
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
    getThinkingMemory(userId),
  ]);

  const hintStats = thinkingMemory.hintStats
    .filter((stat) => stat.uses > 0)
    .sort((left, right) => right.uses - left.uses);
  const clarificationEvents = thinkingMemory.clarificationQuestionEvents;
  const clarificationQuestionStats = thinkingMemory.clarificationQuestionStats
    .filter((stat) => stat.answers > 0 || stat.dismisses > 0);

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
  const clarificationFeedbackCount = clarificationEvents.length;
  const clarificationDismissRate = buildClarificationDismissRate(clarificationEvents);
  const clarificationDownrankedStyles = clarificationQuestionStats.filter(
    (stat) => getClarificationQuestionNoiseAssessment(stat).level === "downranked"
  ).length;
  const clarificationSuppressedStyles = clarificationQuestionStats.filter(
    (stat) => getClarificationQuestionNoiseAssessment(stat).level === "suppressed"
  ).length;

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
  const clarificationDismissTrend = buildTrend(
    buildClarificationDismissRate(clarificationEvents, sevenDaysAgo),
    buildClarificationDismissRate(clarificationEvents, thirtyDaysAgo),
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

  // Write today's snapshot non-blocking — do not backfill here (belongs in worker).
  // Wrapped in try/catch so the page degrades gracefully if the table doesn't exist yet.
  let snapshots: SnapshotRow[] = [];
  try {
    await upsertUserMetricSnapshotForDate(userId, now);
    snapshots = await snapshotClient.userMetricSnapshot.findMany({
      where: {
        userId,
        snapshotDate: { gte: startOfDay(thirtyDaysAgo) },
      },
      orderBy: {
        snapshotDate: "asc",
      },
      take: 30,
      select: {
        snapshotDate: true,
        avgConfidence: true,
        clarificationRate: true,
        avgTimeToResolutionMs: true,
      },
    });
  } catch (snapshotError) {
    // Table may not be migrated yet — log and continue with empty history
    console.warn("UserMetricSnapshot unavailable (migration pending?):", snapshotError);
  }

  const clarificationDismissRateHistory = buildClarificationDismissRateHistory(clarificationEvents, now);

  return {
    totalNotes,
    processedNotes,
    stillProcessing,
    lowConfidenceCount: lowConfidenceNotes,
    clarificationRate,
    clarificationConversionRate,
    clarificationDismissRate,
    clarificationFeedbackCount,
    clarificationDownrankedStyles,
    clarificationSuppressedStyles,
    avgConfidence,
    avgHintLift,
    hintUses: totalHintUses,
    avgTimeToResolutionMs,
    failedJobs,
    trends: {
      confidence: confidenceTrend,
      clarificationRate: clarificationTrend,
      clarificationDismissRate: clarificationDismissTrend,
      resolutionTimeMs: resolutionTrend,
    },
    history: {
      confidence: snapshots.map((snapshot: SnapshotRow) => ({
        date: snapshot.snapshotDate.toISOString(),
        value: snapshot.avgConfidence,
      })),
      clarificationRate: snapshots.map((snapshot: SnapshotRow) => ({
        date: snapshot.snapshotDate.toISOString(),
        value: snapshot.clarificationRate,
      })),
      clarificationDismissRate: clarificationDismissRateHistory,
      resolutionTimeMs: snapshots.map((snapshot: SnapshotRow) => ({
        date: snapshot.snapshotDate.toISOString(),
        value: snapshot.avgTimeToResolutionMs,
      })),
    },
  };
}
