-- CreateTable
CREATE TABLE "UserMetricSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "snapshotDate" TIMESTAMP(3) NOT NULL,
    "avgConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "clarificationRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgTimeToResolutionMs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserMetricSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserMetricSnapshot_userId_snapshotDate_key" ON "UserMetricSnapshot"("userId", "snapshotDate");

-- CreateIndex
CREATE INDEX "UserMetricSnapshot_userId_snapshotDate_idx" ON "UserMetricSnapshot"("userId", "snapshotDate");

-- AddForeignKey
ALTER TABLE "UserMetricSnapshot" ADD CONSTRAINT "UserMetricSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
