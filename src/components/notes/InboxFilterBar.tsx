"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

interface InboxFilterBarProps {
  categories: string[];
  tags: string[];
}

/**
 * Client-side filter bar for the Inbox — filters by category or tag via URL params.
 */
export default function InboxFilterBar({ categories, tags }: InboxFilterBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeCategory = searchParams.get("category") || "";
  const activeTag = searchParams.get("tag") || "";

  const setFilter = useCallback(
    (key: "category" | "tag", value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
        if (key === "category") params.delete("tag");
        if (key === "tag") params.delete("category");
      } else {
        params.delete(key);
      }
      router.push(`/inbox?${params.toString()}`);
    },
    [router, searchParams]
  );

  const clearAll = () => {
    router.push("/inbox");
  };

  const hasFilter = activeCategory || activeTag;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Filter:</span>

      {categories.map((cat) => (
        <button
          key={cat}
          onClick={() => setFilter("category", activeCategory === cat ? "" : cat)}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            activeCategory === cat
              ? "bg-purple-600 text-white"
              : "bg-purple-100 text-purple-700 hover:bg-purple-200"
          }`}
        >
          {cat}
        </button>
      ))}

      {tags.map((tag) => (
        <button
          key={tag}
          onClick={() => setFilter("tag", activeTag === tag ? "" : tag)}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            activeTag === tag
              ? "bg-gray-700 text-white"
              : "bg-gray-200 text-gray-700 hover:bg-gray-300"
          }`}
        >
          #{tag}
        </button>
      ))}

      {hasFilter && (
        <button
          onClick={clearAll}
          className="rounded-full border border-gray-300 px-3 py-1 text-xs text-gray-600 hover:bg-gray-100"
        >
          Clear filters ×
        </button>
      )}
    </div>
  );
}
