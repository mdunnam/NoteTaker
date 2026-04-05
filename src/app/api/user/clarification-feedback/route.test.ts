import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/userMemory", () => ({
  getClarificationQuestionStats: vi.fn(),
  restoreClarificationQuestionFeedback: vi.fn(),
}));

import { auth } from "@/auth";
import {
  getClarificationQuestionStats,
  restoreClarificationQuestionFeedback,
} from "@/lib/userMemory";
import { POST } from "./route";

const mockedAuth = vi.mocked(auth);
const mockedGetClarificationQuestionStats = vi.mocked(getClarificationQuestionStats);
const mockedRestoreClarificationQuestionFeedback = vi.mocked(restoreClarificationQuestionFeedback);

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/user/clarification-feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/user/clarification-feedback POST", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedRestoreClarificationQuestionFeedback.mockResolvedValue(true);
  });

  it("returns 401 when not authenticated", async () => {
    mockedAuth.mockResolvedValue(null as never);

    const response = await POST(makeRequest({ key: "project", action: "restore" }));

    expect(response.status).toBe(401);
  });

  it("returns 400 for invalid payloads", async () => {
    mockedAuth.mockResolvedValue({ user: { id: "u1" } } as never);

    const response = await POST(makeRequest({ key: "", action: "restore" }));

    expect(response.status).toBe(400);
  });

  it("returns 404 when the clarification style is unknown", async () => {
    mockedAuth.mockResolvedValue({ user: { id: "u1" } } as never);
    mockedGetClarificationQuestionStats.mockResolvedValue([]);

    const response = await POST(makeRequest({ key: "project", action: "restore" }));

    expect(response.status).toBe(404);
  });

  it("records a restore for one clarification style", async () => {
    mockedAuth.mockResolvedValue({ user: { id: "u1" } } as never);
    mockedGetClarificationQuestionStats.mockResolvedValue([
      {
        key: "project",
        label: "Which project is this for?",
        answers: 0,
        dismisses: 2,
        restores: 0,
        lastAction: "dismissed",
        lastActionAt: "2026-04-04T00:00:00.000Z",
      },
    ] as never);

    const response = await POST(makeRequest({ key: "project", action: "restore" }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.action).toBe("restored");
    expect(mockedRestoreClarificationQuestionFeedback).toHaveBeenCalledWith("u1", "project");
  });
});
