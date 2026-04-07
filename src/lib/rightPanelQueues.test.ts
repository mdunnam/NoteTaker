import { describe, expect, it } from "vitest";

import { getFirstClarificationQuestion, getPriorityQueueItems } from "./rightPanelQueues";

describe("getPriorityQueueItems", () => {
  it("returns only the first open extracted tasks up to the requested limit", () => {
    const items = getPriorityQueueItems([
      {
        id: "n1",
        title: "Launch prep",
        extractedTasks: [
          { text: "Draft launch checklist", completed: false },
          { text: "Archive old notes", completed: true },
        ],
      },
      {
        id: "n2",
        title: null,
        extractedTasks: [
          { text: "Book stakeholder review", dueDate: "2026-04-10" },
          { text: "Prep rollout email" },
        ],
      },
    ]);

    expect(items).toEqual([
      {
        noteId: "n1",
        noteTitle: "Launch prep",
        text: "Draft launch checklist",
        dueDate: null,
      },
      {
        noteId: "n2",
        noteTitle: "Untitled note",
        text: "Book stakeholder review",
        dueDate: "2026-04-10",
      },
      {
        noteId: "n2",
        noteTitle: "Untitled note",
        text: "Prep rollout email",
        dueDate: null,
      },
    ]);
  });

  it("ignores malformed or completed extracted tasks", () => {
    const items = getPriorityQueueItems([
      {
        id: "n1",
        title: "Noisy note",
        extractedTasks: [
          null,
          {},
          { text: "   " },
          { text: "Completed task", completed: true },
        ],
      },
    ]);

    expect(items).toEqual([]);
  });
});

describe("getFirstClarificationQuestion", () => {
  it("returns the first non-empty clarification question", () => {
    expect(getFirstClarificationQuestion({ clarificationQuestions: ["", "What project is this for?"] })).toBe(
      "What project is this for?"
    );
  });

  it("returns null when aiMeta does not contain usable questions", () => {
    expect(getFirstClarificationQuestion(null)).toBeNull();
    expect(getFirstClarificationQuestion({ clarificationQuestions: [] })).toBeNull();
    expect(getFirstClarificationQuestion({ clarificationQuestions: [1, false] })).toBeNull();
  });
});