/**
 * Right panel - shows AI insights, related notes, extracted items
 * Placeholder for Phase 4+
 */

export default function RightPanel() {
  return (
    <aside className="w-80 border-l border-border bg-muted/20 p-6 overflow-y-auto">
      <div className="space-y-6">
        <div>
          <h3 className="font-semibold text-sm mb-3">AI Insights</h3>
          <p className="text-xs text-muted-foreground">
            Select a note to see AI-generated insights, related notes, and extracted tasks.
          </p>
        </div>

        <div className="pt-6 border-t border-border">
          <h3 className="font-semibold text-sm mb-3">Note Health</h3>
          <p className="text-xs text-muted-foreground">
            Coming soon: uncategorized notes, unresolved tasks, and more.
          </p>
        </div>
      </div>
    </aside>
  );
}
