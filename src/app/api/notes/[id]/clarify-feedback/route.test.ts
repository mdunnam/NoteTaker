import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: vi.fn(),
}));

vi.mock("@/lib/userMemory", () => ({
  recordClarificationQuestionFeedback: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    note: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { checkRateLimit } from "@/lib/rateLimit";
import { recordClarificationQuestionFeedback } from "@/lib/userMemory";
import { POST } from "./route";

const mockedAuth = vi.mocked(auth);
const mockedFindFirst = vi.mocked(prisma.note.findFirst);
const mockedUpdate = vi.mocked(prisma.note.update);
const mockedCheckRateLimit = vi.mocked(checkRateLimit);
const mockedRecordClarificationQuestionFeedback = vi.mocked(recordClarificationQuestionFeedback);

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/notes/n1/clarify-feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/notes/[id]/clarify-feedback POST", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedCheckRateLimit.mockReturnValue({ ok: true });
    mockedRecordClarificationQuestionFeedback.mockResolvedValue(undefined);
  });

  it("returns 401 when not authenticated", async () => {
    mockedAuth.mockResolvedValue(null as never);

    const response = await POST(makeRequest({ question: "Which project is this for?", action: "dismiss" }), { params: { id: "n1" } });

    expect(response.status).toBe(401);
  });

  it("returns 400 for invalid payloads", async () => {
    mockedAuth.mockResolvedValue({ user: { id: "u1" } } as never);

    const response = await POST(makeRequest({ question: "", action: "dismiss" }), { params: { id: "n1" } });

    expect(response.status).toBe(400);
  });

  it("returns 400 when the question is not currently active on the note", async () => {
    mockedAuth.mockResolvedValue({ user: { id: "u1" } } as never);
    mockedFindFirst.mockResolvedValue({
      id: "n1",
      aiMeta: {
        clarificationQuestions: ["What context is this in?"],
        clarificationHistory: [],
      },
    } as never);

    const response = await POST(makeRequest({ question: "Which project is this for?", action: "dismiss" }), { params: { id: "n1" } });

    expect(response.status).toBe(400);
  });

  it("records dismiss feedback and removes the question from aiMeta", async () => {
    mockedAuth.mockResolvedValue({ user: { id: "u1" } } as never);
    mockedFindFirst.mockResolvedValue({
      id: "n1",
      aiMeta: {
        clarificationQuestions: ["Which project is this for?", "What context is this in?"],
        clarificationHistory: [],
      },
    } as never);
    mockedUpdate.mockResolvedValue({
      id: "n1",
      aiMeta: {
        clarificationQuestions: ["What context is this in?"],
        clarificationHistory: [],
      },
    } as never);

    const response = await POST(makeRequest({ question: "Which project is this for?", action: "dismiss" }), { params: { id: "n1" } });

    expect(response.status).toBe(200);
    expect(mockedUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          aiMeta: expect.objectContaining({
            clarificationQuestions: ["What context is this in?"],
          }),
        }),
      })
    );
    expect(mockedRecordClarificationQuestionFeedback).toHaveBeenCalledWith("u1", "Which project is this for?", "dismissed");
  });
});
