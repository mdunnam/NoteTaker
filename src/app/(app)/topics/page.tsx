import { auth } from "@/auth";
import KnowledgeClustersClient from "@/components/notes/KnowledgeClustersClient";
import { getUserKnowledgeClusters } from "@/lib/clusters";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";

/**
 * Topics page showing inferred topic clusters and their connected notes.
 */
export default async function TopicsPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const [clusters, noteCount] = await Promise.all([
    getUserKnowledgeClusters(session.user.id, { kind: "topic" }),
    prisma.note.count({
      where: {
        userId: session.user.id,
        isArchived: false,
        status: "PROCESSED",
      },
    }),
  ]);

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-2 text-gray-900">Topics</h1>
      <p className="mb-6 max-w-3xl text-gray-600">
        QNote now groups recurring themes across notes into topic clusters, so related conversations become browsable threads instead of isolated cards.
      </p>

      {noteCount === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-gray-600">
          No processed notes yet. Capture and organize a few notes first.
        </div>
      ) : clusters.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-gray-600">
          No strong topic clusters yet. As notes start sharing topics, tags, and related context, they will appear here.
        </div>
      ) : (
        <KnowledgeClustersClient clusters={clusters} kind="topic" />
      )}
    </div>
  );
}
