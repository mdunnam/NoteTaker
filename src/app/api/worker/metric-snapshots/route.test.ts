import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/userStats", () => ({
  ensureRecentUserMetricSnapshots: vi.fn(),
  backfillRecentMetricSnapshotsForAllUsers: vi.fn(),
}));

import {
  backfillRecentMetricSnapshotsForAllUsers,
  ensureRecentUserMetricSnapshots,
} from "@/lib/userStats";
import { GET, POST } from "./route";

const mockedEnsureRecentUserMetricSnapshots = vi.mocked(ensureRecentUserMetricSnapshots);
const mockedBackfillRecentMetricSnapshotsForAllUsers = vi.mocked(backfillRecentMetricSnapshotsForAllUsers);

describe("/api/worker/metric-snapshots", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WORKER_SECRET = "test-worker-secret";
  });

  it("returns 403 when unauthorized", async () => {
    const request = new NextRequest("http://localhost/api/worker/metric-snapshots", {
      method: "GET",
    });

    const response = await GET(request);

    expect(response.status).toBe(403);
  });

  it("backfills one user when userId is provided", async () => {
    mockedEnsureRecentUserMetricSnapshots.mockResolvedValue(5);

    const request = new NextRequest("http://localhost/api/worker/metric-snapshots", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-worker-secret",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ userId: "u1", days: 14 }),
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.mode).toBe("single-user");
    expect(payload.snapshotsCreated).toBe(5);
    expect(mockedEnsureRecentUserMetricSnapshots).toHaveBeenCalledWith("u1", 14);
  });

  it("backfills all users when no userId is provided", async () => {
    mockedBackfillRecentMetricSnapshotsForAllUsers.mockResolvedValue({
      usersProcessed: 3,
      snapshotsCreated: 21,
    });

    const request = new NextRequest("http://localhost/api/worker/metric-snapshots", {
      method: "GET",
      headers: {
        Authorization: "Bearer test-worker-secret",
      },
    });

    const response = await GET(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.mode).toBe("all-users");
    expect(payload.usersProcessed).toBe(3);
    expect(payload.snapshotsCreated).toBe(21);
    expect(mockedBackfillRecentMetricSnapshotsForAllUsers).toHaveBeenCalledWith(30);
  });
});
