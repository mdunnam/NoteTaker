import { describe, expect, it } from "vitest";

import { buildSynthesisProjectPayload, canCreateProjectFromSynthesis } from "./synthesisProject";

describe("canCreateProjectFromSynthesis", () => {
  it("returns true when the synthesis has enough action density", () => {
    expect(canCreateProjectFromSynthesis({
      title: "Launch plan",
      summary: "Combined launch synthesis.",
      actions: ["Resolve blockers", "Assign owners", "Ship checklist"],
      sourceNoteIds: ["n1", "n2"],
      plan: {
        steps: [
          { title: "One", detail: "", horizon: "now" },
          { title: "Two", detail: "", horizon: "next" },
        ],
      },
    })).toBe(true);
  });

  it("returns false when the synthesis is too thin", () => {
    expect(canCreateProjectFromSynthesis({
      title: "Thin synthesis",
      summary: "Short.",
      actions: ["One action"],
      sourceNoteIds: ["n1", "n2"],
      plan: {
        steps: [{ title: "One", detail: "", horizon: "now" }],
      },
    })).toBe(false);
  });
});

describe("buildSynthesisProjectPayload", () => {
  it("uses the synthesis title and source notes to create a collection payload", () => {
    expect(buildSynthesisProjectPayload({
      title: " Launch plan ",
      summary: " Combined launch synthesis. ",
      actions: ["Resolve blockers", "Assign owners", "Ship checklist"],
      sourceNoteIds: ["n1", "n2"],
      plan: {
        steps: [
          { title: "One", detail: "", horizon: "now" },
          { title: "Two", detail: "", horizon: "next" },
          { title: "Three", detail: "", horizon: "later" },
        ],
      },
    })).toEqual({
      name: "Launch plan",
      description: "Combined launch synthesis.",
      color: "blue",
      noteIds: ["n1", "n2"],
    });
  });
});