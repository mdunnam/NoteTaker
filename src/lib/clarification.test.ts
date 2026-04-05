import { describe, expect, it } from "vitest";
import {
  buildClarificationQuestionKey,
  filterClarificationQuestionsByFeedback,
  getClarificationQuestionNoiseAssessment,
  parseNoteAiMeta,
  type ClarificationQuestionStat,
} from "@/lib/clarification";

describe("clarification feedback helpers", () => {
  it("normalizes known question styles into stable keys", () => {
    expect(buildClarificationQuestionKey("Which project is this for?")).toBe("project");
    expect(buildClarificationQuestionKey("What context is this in?")).toBe("context");
  });

  it("suppresses heavily dismissed question styles", () => {
    const assessment = getClarificationQuestionNoiseAssessment({
      key: "project",
      label: "Which project is this for?",
      answers: 0,
      dismisses: 2,
      restores: 0,
      lastAction: "dismissed",
      lastActionAt: "2026-04-04T00:00:00.000Z",
    });

    expect(assessment.level).toBe("suppressed");
  });

  it("filters duplicate and heavily noisy clarification questions", () => {
    const stats: ClarificationQuestionStat[] = [
      {
        key: "project",
        label: "Which project is this for?",
        answers: 0,
        dismisses: 2,
        restores: 0,
        lastAction: "dismissed",
        lastActionAt: "2026-04-04T00:00:00.000Z",
      },
      {
        key: "context",
        label: "What context is this in?",
        answers: 1,
        dismisses: 0,
        restores: 0,
        lastAction: "answered",
        lastActionAt: "2026-04-04T00:00:00.000Z",
      },
    ];

    const questions = filterClarificationQuestionsByFeedback(
      [
        "Which project is this for?",
        "What context is this in?",
        "What context is this in?",
      ],
      stats
    );

    expect(questions).toEqual(["What context is this in?"]);
  });

  it("lets restore actions offset a previously suppressed clarification style", () => {
    const assessment = getClarificationQuestionNoiseAssessment({
      key: "project",
      label: "Which project is this for?",
      answers: 0,
      dismisses: 2,
      restores: 1,
      lastAction: "restored",
      lastActionAt: "2026-04-04T00:00:00.000Z",
    });

    expect(assessment.level).toBe("normal");
    expect(assessment.noiseScore).toBe(0);
  });

  it("parses external capture metadata from aiMeta", () => {
    const parsed = parseNoteAiMeta({
      externalCapture: {
        source: "bookmarklet",
        title: "Interesting article",
        url: "https://example.com/story",
      },
    });

    expect(parsed.externalCapture).toEqual({
      source: "bookmarklet",
      title: "Interesting article",
      url: "https://example.com/story",
    });
  });
});