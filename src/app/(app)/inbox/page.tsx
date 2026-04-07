/**
 * Inbox page - main triage view for new/unprocessed notes
 */

import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { getUserReclassificationCandidates } from "@/lib/clusters";
import { getUserForgottenNoteCandidates, getUserReviewPatterns } from "@/lib/resurfacing";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import InboxStream from "@/components/notes/InboxStream";
import InboxFilterBar from "@/components/notes/InboxFilterBar";
import { getThinkingMemory, getThinkingMemoryHints, isReviewItemSuppressed } from "@/lib/userMemory";

interface InboxPageProps {
  searchParams?: { category?: string; tag?: string };
}

export default async function InboxPage({ searchParams }: InboxPageProps) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const activeCategory = searchParams?.category || "";
  const activeTag = searchParams?.tag || "";

  const [notes, reclassificationCandidates, forgottenCandidates, reviewPatterns] = await Promise.all([
    prisma.note.findMany({
      where: {
        userId: session.user.id,
        status: { in: ["UNPROCESSED", "PROCESSED"] },
        isArchived: false,
        ...(activeCategory ? { category: activeCategory } : {}),
        ...(activeTag ? { tags: { has: activeTag } } : {}),
      },
      orderBy: {
        createdAt: "desc",
      },
      include: {
        collection: true,
        entities: {
          include: {
            entity: true,
          },
        },
      },
    }),
    getUserReclassificationCandidates(session.user.id, 6),
    getUserForgottenNoteCandidates(session.user.id, 4),
    getUserReviewPatterns(session.user.id, 4),
  ]);

  // Collect unique categories and tags from ALL non-archived notes for the filter bar.
  const allNotes = await prisma.note.findMany({
    where: { userId: session.user.id, isArchived: false },
    select: { category: true, tags: true },
  });

  const categories = [...new Set(allNotes.map((n) => n.category).filter(Boolean))] as string[];
  const tags = [...new Set(allNotes.flatMap((n) => n.tags))].filter(Boolean).slice(0, 20);
  const thinkingMemory = await getThinkingMemory(session.user.id);
  const quickHints = getThinkingMemoryHints(thinkingMemory);
  const visibleForgottenCandidates = forgottenCandidates.filter(
    (candidate) => !isReviewItemSuppressed(thinkingMemory.reviewState, "forgotten-note", candidate.note.id)
  );
  const visibleReviewPatterns = reviewPatterns.filter(
    (pattern) => !isReviewItemSuppressed(thinkingMemory.reviewState, "pattern", pattern.id)
  );

  return (
    <div className="p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Inbox</h1>
        <p className="text-sm text-gray-500 mt-1">
          Your latest captures — AI is organizing them in the background.
        </p>
      </div>

      {(categories.length > 0 || tags.length > 0) && (
        <Suspense>
          <InboxFilterBar categories={categories} tags={tags} />
        </Suspense>
      )}

      <InboxStream
        notes={notes}
        reclassificationCandidates={reclassificationCandidates}
        forgottenCandidates={visibleForgottenCandidates}
        reviewPatterns={visibleReviewPatterns}
        quickHints={quickHints}
      />
    </div>
  );
}
