export interface SynthesisProjectResult {
  title: string;
  summary: string;
  actions: string[];
  sourceNoteIds: string[];
  plan: {
    steps: Array<{
      title: string;
      detail: string;
      horizon: "now" | "next" | "later";
    }>;
  };
}

/** Determine whether a synthesis is strong enough to become a project collection. */
export function canCreateProjectFromSynthesis(result: SynthesisProjectResult): boolean {
  return (
    result.sourceNoteIds.length >= 2 &&
    result.title.trim().length > 0 &&
    (result.actions.length >= 3 || result.plan.steps.length >= 3)
  );
}

/** Build the collection payload for turning a synthesis into a project. */
export function buildSynthesisProjectPayload(result: SynthesisProjectResult) {
  return {
    name: result.title.trim(),
    description: result.summary.trim() || null,
    color: "blue",
    noteIds: result.sourceNoteIds,
  };
}