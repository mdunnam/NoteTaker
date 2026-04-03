/**
 * Inbox page - main triage view for new/unprocessed notes
 */

import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { getUserReclassificationCandidates } from "@/lib/clusters";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import InboxStream from "@/components/notes/InboxStream";
import InboxFilterBar from "@/components/notes/InboxFilterBar";
import { getThinkingMemory, getThinkingMemoryHints } from "@/lib/userMemory";

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

  const [notes, reclassificationCandidates] = await Promise.all([
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

  return (
    <div className="p-6">
      <div className="mb-4">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Inbox</h1>
        <p className="text-gray-600 mt-2">
          {notes.length === 0
            ? (activeCategory || activeTag ? "No notes match this filter." : "No notes yet. Start capturing!")
            : `${notes.length} note${notes.length !== 1 ? "s" : ""}${activeCategory ? ` in "${activeCategory}"` : ""}${activeTag ? ` tagged #${activeTag}` : ""}`}
        </p>
      </div>

      {(categories.length > 0 || tags.length > 0) && (
        <Suspense>
          <InboxFilterBar categories={categories} tags={tags} />
        </Suspense>
      )}

      <InboxStream notes={notes} reclassificationCandidates={reclassificationCandidates} quickHints={quickHints} />
    </div>
  );
}
