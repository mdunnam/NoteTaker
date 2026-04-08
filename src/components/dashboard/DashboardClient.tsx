"use client";

import { useState } from "react";
import Link from "next/link";
import type { DigestContent, DigestSection, DigestItem } from "@/lib/digestTypes";

interface Props {
  digest: DigestContent;
  dateStr: string;
}

const URGENCY_COLORS: Record<string, string> = {
  high: "border-l-red-400 bg-red-50",
  medium: "border-l-amber-300 bg-amber-50",
  low: "border-l-gray-200 bg-white",
};

const URGENCY_DOT: Record<string, string> = {
  high: "bg-red-500",
  medium: "bg-amber-400",
  low: "bg-gray-300",
};

function DigestItemCard({ item }: { item: DigestItem }) {
  const [expanded, setExpanded] = useState(false);
  const colorClass = URGENCY_COLORS[item.urgency] ?? URGENCY_COLORS.low;
  const dotClass = URGENCY_DOT[item.urgency] ?? URGENCY_DOT.low;

  return (
    <div
      className={`border-l-4 rounded-lg px-4 py-3 shadow-sm ${colorClass} cursor-pointer transition-all`}
      onClick={() => item.detail && setExpanded((v) => !v)}
    >
      <div className="flex items-start gap-3">
        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dotClass}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 leading-snug">{item.text}</p>
          {expanded && item.detail && (
            <p className="mt-2 text-sm text-gray-600 leading-relaxed">{item.detail}</p>
          )}
          {item.noteIds.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {item.noteIds.map((id) => (
                <Link
                  key={id}
                  href={`/notes/${id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="text-[11px] text-blue-600 hover:underline"
                >
                  Open note →
                </Link>
              ))}
            </div>
          )}
        </div>
        {item.detail && (
          <span className="text-xs text-gray-400 shrink-0 mt-0.5">{expanded ? "▲" : "▼"}</span>
        )}
      </div>
    </div>
  );
}

function SectionBlock({ section }: { section: DigestSection }) {
  if (!section.items.length) return null;

  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
        <span>{section.emoji}</span>
        <span>{section.label}</span>
        <span className="ml-auto text-[11px] font-normal normal-case text-gray-400">
          {section.items.length} {section.items.length === 1 ? "item" : "items"}
        </span>
      </h2>
      <div className="space-y-2">
        {section.items.map((item) => (
          <DigestItemCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}

export default function DashboardClient({ digest: initialDigest, dateStr }: Props) {
  const [digest, setDigest] = useState<DigestContent>(initialDigest);
  const [isRegenerating, setIsRegenerating] = useState(false);

  const generatedAt = digest.generatedAt
    ? new Date(digest.generatedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : null;

  async function handleRegenerate() {
    setIsRegenerating(true);
    try {
      const res = await fetch("/api/digest", { method: "POST" });
      if (res.ok) {
        const fresh: DigestContent = await res.json();
        setDigest(fresh);
      }
    } finally {
      setIsRegenerating(false);
    }
  }

  const totalItems = digest.sections.reduce((sum, s) => sum + s.items.length, 0);

  return (
    <div className="min-h-full bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-gray-400 mb-1">
              {new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", {
                weekday: "long", month: "long", day: "numeric",
              })}
            </p>
            <h1 className="text-3xl font-bold text-gray-900 leading-tight">
              {digest.greeting}
            </h1>
            <p className="mt-2 text-base text-gray-600 leading-relaxed max-w-xl">
              {digest.summary}
            </p>
          </div>
          <button
            onClick={handleRegenerate}
            disabled={isRegenerating}
            className="shrink-0 flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 shadow-sm hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            <span className={isRegenerating ? "animate-spin inline-block" : ""}>⟳</span>
            {isRegenerating ? "Thinking…" : "Refresh"}
          </button>
        </div>

        {/* Meta bar */}
        {(generatedAt || totalItems > 0) && (
          <div className="flex items-center gap-3 text-[12px] text-gray-400">
            {totalItems > 0 && <span>{totalItems} items across {digest.sections.length} sections</span>}
            {generatedAt && <span>· Generated at {generatedAt}</span>}
          </div>
        )}

        {/* Empty state */}
        {digest.sections.length === 0 && (
          <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-white p-12 text-center">
            <p className="text-4xl mb-4">🌿</p>
            <h2 className="text-lg font-semibold text-gray-700">All quiet today</h2>
            <p className="mt-1 text-sm text-gray-500">Dump some notes and I'll find the threads worth following.</p>
            <Link
              href="/inbox"
              className="mt-5 inline-block rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Capture a note →
            </Link>
          </div>
        )}

        {/* Sections */}
        {digest.sections.map((section) => (
          <SectionBlock key={section.key} section={section} />
        ))}

        {/* Footer */}
        <div className="pt-4 border-t border-gray-200 flex items-center justify-between text-xs text-gray-400">
          <span>QNote Daily Digest</span>
          <Link href="/inbox" className="hover:text-blue-600">Go to Inbox →</Link>
        </div>

      </div>
    </div>
  );
}
