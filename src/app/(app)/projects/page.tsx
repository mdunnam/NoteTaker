import { auth } from "@/auth";
import { getUserKnowledgeClusters } from "@/lib/clusters";
import { prisma } from "@/lib/db";
import Link from "next/link";
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
        <div className="space-y-4">
          {clusters.map((cluster) => (
            <section key={cluster.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-4">
                <h2 className="text-lg font-semibold text-gray-900">{cluster.label}</h2>
                <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700">
                  {cluster.noteCount}
                </span>
              </div>

              {cluster.crossReferences.length > 0 && (
                <div className="mb-4 flex flex-wrap gap-2">
                  {cluster.crossReferences.map((reference) => (
                    <span key={`${cluster.id}-${reference}`} className="rounded-full bg-purple-100 px-2.5 py-1 text-xs text-purple-700">
                      Topic: {reference}
                    </span>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {cluster.notes.map((note) => (
                  <Link
                    key={note.id}
                    href={`/notes/${note.id}`}
                    className="rounded-lg border border-gray-100 p-3 transition-colors hover:border-blue-300 hover:bg-blue-50/40"
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
          ))}
        </div>
      )}
    </div>
  );
}
