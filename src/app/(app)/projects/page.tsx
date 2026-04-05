import { auth } from "@/auth";
import KnowledgeClustersClient from "@/components/notes/KnowledgeClustersClient";
import { getUserKnowledgeClusters } from "@/lib/clusters";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";

/**
 * Projects page showing inferred project clusters and their related notes.
 */
export default async function ProjectsPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const [clusters, noteCount] = await Promise.all([
    getUserKnowledgeClusters(session.user.id, { kind: "project" }),
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
      <h1 className="text-3xl font-bold mb-2 text-gray-900">Projects</h1>
      <p className="mb-6 max-w-3xl text-gray-600">
        Project clusters combine AI-suggested projects, entity signals, and shared topics so notes can gradually reorganize into the work they actually belong to.
      </p>

      {noteCount === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-gray-600">
          No notes available yet.
        </div>
      ) : clusters.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-gray-600">
          No strong project clusters yet. As notes connect around the same work stream, they will appear here.
        </div>
      ) : (
        <KnowledgeClustersClient clusters={clusters} kind="project" />
      )}
    </div>
  );
}
