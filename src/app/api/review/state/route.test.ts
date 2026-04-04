import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: vi.fn(),
}));

vi.mock("@/lib/userMemory", () => ({
  suppressReviewItem: vi.fn(),
  restoreReviewItem: vi.fn(),
}));

import { auth } from "@/auth";
import { checkRateLimit } from "@/lib/rateLimit";
import { restoreReviewItem, suppressReviewItem } from "@/lib/userMemory";
import { POST } from "./route";

const mockedAuth = vi.mocked(auth);
const mockedCheckRateLimit = vi.mocked(checkRateLimit);
const mockedSuppressReviewItem = vi.mocked(suppressReviewItem);
const mockedRestoreReviewItem = vi.mocked(restoreReviewItem);

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/review/state", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/review/state POST", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedCheckRateLimit.mockReturnValue({ ok: true });
    mockedSuppressReviewItem.mockResolvedValue("2026-04-11T00:00:00.000Z");
    mockedRestoreReviewItem.mockResolvedValue(undefined);
  });

  it("returns 401 when not authenticated", async () => {
    mockedAuth.mockResolvedValue(null as never);

    const response = await POST(makeRequest({ kind: "forgotten-note", targetId: "n1", action: "snooze" }));

    expect(response.status).toBe(401);
  });

  it("returns 400 for invalid payloads", async () => {
    mockedAuth.mockResolvedValue({ user: { id: "u1" } } as never);

    const response = await POST(makeRequest({ kind: "bad-kind", targetId: "n1", action: "snooze" }));

    expect(response.status).toBe(400);
  });

  it("persists snooze windows for forgotten-note review items", async () => {
    mockedAuth.mockResolvedValue({ user: { id: "u1" } } as never);

    const response = await POST(makeRequest({ kind: "forgotten-note", targetId: "n1", action: "snooze", label: "Old task note" }));
    const payload = (await response.json()) as { action: string; until: string };

    expect(response.status).toBe(200);
    expect(payload.action).toBe("snooze");
    expect(mockedSuppressReviewItem).toHaveBeenCalledWith("u1", "forgotten-note", "n1", 7, "Old task note");
  });

  it("persists dismiss windows for pattern review items", async () => {
    mockedAuth.mockResolvedValue({ user: { id: "u1" } } as never);

    const response = await POST(makeRequest({ kind: "pattern", targetId: "topic:downtime", action: "dismiss" }));

    expect(response.status).toBe(200);
    expect(mockedSuppressReviewItem).toHaveBeenCalledWith("u1", "pattern", "topic:downtime", 30, undefined);
  });

  it("restores previously suppressed review items", async () => {
    mockedAuth.mockResolvedValue({ user: { id: "u1" } } as never);

    const response = await POST(makeRequest({ kind: "pattern", targetId: "topic:downtime", action: "restore" }));

    expect(response.status).toBe(200);
    expect(mockedRestoreReviewItem).toHaveBeenCalledWith("u1", "pattern", "topic:downtime");
  });
});