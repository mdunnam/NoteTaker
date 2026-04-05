"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import MultiNoteSynthesisPanel from "@/components/notes/MultiNoteSynthesisPanel";
import type { KnowledgeCluster } from "@/lib/clusters";

interface KnowledgeClustersClientProps {
  clusters: KnowledgeCluster[];
  kind: "project" | "topic";
}

/**
 * Rich cluster browser with per-cluster synthesis and planning actions.
 */
export default function KnowledgeClustersClient({ clusters, kind }: KnowledgeClustersClientProps) {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"size" | "label">("size");
  const [expandedClusterId, setExpandedClusterId] = useState<string | null>(clusters[0]?.id || null);

  const filteredClusters = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const visible = clusters.filter((cluster) => {
      if (!normalizedSearch) {
        return true;
      }

      const haystack = [
        cluster.label,
        cluster.dominantCategory || "",
        ...cluster.crossReferences,
        ...cluster.notes.map((note) => `${note.title || ""} ${note.summary || ""}`),
      ].join(" ").toLowerCase();

      return haystack.includes(normalizedSearch);
    });

    return [...visible].sort((left, right) => {
      if (sortBy === "label") {
        return left.label.localeCompare(right.label);
      }

      return right.noteCount - left.noteCount || left.label.localeCompare(right.label);
    });
  }, [clusters, search, sortBy]);

  const totalLinkedNotes = useMemo(() => {
    return filteredClusters.reduce((sum, cluster) => sum + cluster.noteCount, 0);
  }, [filteredClusters]);

  const largestCluster = filteredClusters[0] || null;
  const kindLabel = kind === "project" ? "project" : "topic";

  /** Expand or collapse one cluster's planning panel. */
  const toggleExpanded = (clusterId: string) => {
    setExpandedClusterId((current) => current === clusterId ? null : clusterId);
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Visible clusters</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{filteredClusters.length}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Linked notes</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{totalLinkedNotes}</p>
        </div>
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <p className="text-xs uppercase tracking-wide text-blue-700">Largest cluster</p>
          <p className="mt-1 text-lg font-bold text-blue-900 line-clamp-1">{largestCluster?.label || "-"}</p>
        </div>
        <div className="rounded-lg border border-purple-200 bg-purple-50 p-4">
          <p className="text-xs uppercase tracking-wide text-purple-700">Planning coverage</p>
          <p className="mt-1 text-sm font-semibold text-purple-900">Uses the most recent {clusters[0]?.notes.length || 0} notes per cluster</p>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_180px]">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={`Search ${kindLabel} clusters...`}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <select
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value as typeof sortBy)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="size">Sort by size</option>
            <option value="label">Sort by label</option>
          </select>
        </div>
      </div>

      {filteredClusters.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-12 text-center text-sm text-gray-600">
          No clusters match the current search.
        </div>
      ) : (
        <div className="space-y-4">
          {filteredClusters.map((cluster) => {
            const isExpanded = expandedClusterId === cluster.id;

            return (
              <section key={cluster.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold text-gray-900">{cluster.label}</h2>
                      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${kind === "project" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>
                        {cluster.noteCount} notes
                      </span>
                      {cluster.dominantCategory && (
                        <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] text-gray-700">
                          {cluster.dominantCategory}
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-sm text-gray-600">
                      {kind === "project"
                        ? `Plan directly from this project cluster using the most recent linked notes, then turn the cluster into a concrete execution path.`
                        : `Turn this topic cluster into a concrete plan without leaving the topic browser.`}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => toggleExpanded(cluster.id)}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    {isExpanded ? "Hide plan" : kind === "project" ? "Plan project" : "Plan topic"}
                  </button>
                </div>

                {cluster.crossReferences.length > 0 && (
                  <div className="mb-4 flex flex-wrap gap-2">
                    {cluster.crossReferences.map((reference) => (
                      <span
                        key={`${cluster.id}-${reference}`}
                        className={`rounded-full px-2.5 py-1 text-xs ${kind === "project" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}
                      >
                        {kind === "project" ? `Topic: ${reference}` : `Connected to ${reference}`}
                      </span>
                    ))}
                  </div>
                )}

                {isExpanded && (
                  <div className="mb-4">
                    <MultiNoteSynthesisPanel
                      notes={cluster.notes.map((note) => ({ id: note.id, title: note.title }))}
                      title={kind === "project" ? `Plan from ${cluster.label}` : `Plan around ${cluster.label}`}
                      description={kind === "project"
                        ? `Synthesize the most recent notes in ${cluster.label} into one brief and execution plan.`
                        : `Synthesize the most recent notes around ${cluster.label} into one topic brief and action plan.`}
                      planningGoalPlaceholder={kind === "project"
                        ? `Optional planning lens: ship ${cluster.label}, prep stakeholder review, unblock the next milestone...`
                        : `Optional planning lens: make ${cluster.label} actionable, prep a decision, turn this into next steps...`}
                    />
                  </div>
                )}

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {cluster.notes.map((note) => (
                    <Link
                      key={note.id}
                      href={`/notes/${note.id}`}
                      className={`rounded-lg border border-gray-100 p-3 transition-colors ${kind === "project" ? "hover:border-blue-300 hover:bg-blue-50/40" : "hover:border-purple-300 hover:bg-purple-50/40"}`}
                    >
                      <div className="text-sm font-medium text-gray-900">{note.title || "Untitled note"}</div>
                      <div className="mt-1 line-clamp-2 text-sm text-gray-600">{note.summary || "No summary yet."}</div>
                      <div className="mt-2 text-[11px] text-gray-500">
                        {new Date(note.createdAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}