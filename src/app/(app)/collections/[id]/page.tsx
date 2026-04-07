import { auth } from "@/auth";
import MultiNoteSynthesisPanel from "@/components/notes/MultiNoteSynthesisPanel";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

interface CollectionDetailPageProps {
  params: { id: string };
}

/** Collection detail page with note browsing and synthesis actions. */
export default async function CollectionDetailPage({ params }: CollectionDetailPageProps) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const collection = await prisma.collection.findFirst({
    where: {
      id: params.id,
      userId: session.user.id,
    },
    include: {
      notes: {
        where: { isArchived: false },
        orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          title: true,
          summary: true,
          category: true,
          suggestedProject: true,
          type: true,
          priority: true,
          isPinned: true,
          createdAt: true,
        },
      },
      _count: {
        select: { notes: true },
      },
    },
  });

  if (!collection) {
    notFound();
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <Link href="/collections" className="text-sm text-blue-600 hover:underline">
          ← Back to Collections
        </Link>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span
                className="h-4 w-4 rounded-full"
                style={{ background: collection.color || "#94a3b8" }}
              />
              <h1 className="text-3xl font-bold text-gray-900">{collection.name}</h1>
              <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-700">
                {collection.notes.length} visible notes
              </span>
            </div>
            {collection.description && (
              <p className="mt-3 max-w-3xl text-gray-600">{collection.description}</p>
            )}
          </div>

          <div className="grid min-w-[220px] grid-cols-2 gap-3">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-[11px] uppercase tracking-wide text-gray-500">Total notes</p>
              <p className="mt-1 text-xl font-semibold text-gray-900">{collection._count.notes}</p>
            </div>
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
              <p className="text-[11px] uppercase tracking-wide text-blue-700">Pinned</p>
              <p className="mt-1 text-xl font-semibold text-blue-900">
                {collection.notes.filter((note) => note.isPinned).length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {collection.notes.length >= 2 && (
        <MultiNoteSynthesisPanel
          notes={collection.notes.map((note) => ({ id: note.id, title: note.title }))}
          title={`Synthesize ${collection.name}`}
          description="Turn this collection into one shared brief, themes, and next-step plan."
          planningGoalPlaceholder={`Optional planning lens: move ${collection.name} forward, prepare review, define next milestone...`}
        />
      )}

      {collection.notes.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-gray-600">
          This collection has no active notes yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {collection.notes.map((note) => (
            <Link
              key={note.id}
              href={`/notes/${note.id}`}
              className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50/30"
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-gray-900">{note.title || "Untitled note"}</p>
                {note.isPinned && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                    pinned
                  </span>
                )}
                {note.priority && (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-700">
                    {note.priority}
                  </span>
                )}
              </div>

              <p className="mt-2 line-clamp-3 text-sm text-gray-600">{note.summary || "No summary yet."}</p>

              <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-gray-500">
                {note.category && (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-700">{note.category}</span>
                )}
                {note.type && (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-700">{note.type}</span>
                )}
                {note.suggestedProject && (
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-blue-700">{note.suggestedProject}</span>
                )}
              </div>

              <p className="mt-3 text-[11px] text-gray-500">
                {new Date(note.createdAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}