import { auth } from "@/auth";
import { getUserKnowledgeClusters } from "@/lib/clusters";
import { prisma } from "@/lib/db";
import Link from "next/link";
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
        <div className="space-y-4">
          {clusters.map((cluster) => (
            <section key={cluster.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">{cluster.label}</h2>
                  <p className="mt-1 text-sm text-gray-600">
                    {cluster.noteCount} linked note{cluster.noteCount === 1 ? "" : "s"}
                    {cluster.dominantCategory ? ` · dominant category: ${cluster.dominantCategory}` : ""}
                  </p>
                </div>
                <span className="rounded-full bg-purple-100 px-3 py-1 text-xs font-medium text-purple-700">
                  Topic cluster
                </span>
              </div>

              {cluster.crossReferences.length > 0 && (
                <div className="mb-4 flex flex-wrap gap-2">
                  {cluster.crossReferences.map((reference) => (
                    <span key={`${cluster.id}-${reference}`} className="rounded-full bg-blue-100 px-2.5 py-1 text-xs text-blue-700">
                      Connected to {reference}
                    </span>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {cluster.notes.map((note) => (
                  <Link
                    key={note.id}
                    href={`/notes/${note.id}`}
                    className="rounded-lg border border-gray-100 p-3 transition-colors hover:border-purple-300 hover:bg-purple-50/40"
                  >
                    <p className="text-sm font-medium text-gray-900">{note.title || "Untitled note"}</p>
                    <p className="mt-1 line-clamp-2 text-sm text-gray-600">{note.summary || "No summary yet."}</p>
                    <p className="mt-2 text-[11px] text-gray-500">
                      {new Date(note.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
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
