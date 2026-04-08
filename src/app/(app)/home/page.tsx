import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const userId = session.user.id;

  const [totalNotes, pinnedNotes, recentNotes, allNotes, topEntities] = await Promise.all([
    prisma.note.count({ where: { userId, isArchived: false } }),

    prisma.note.findMany({
      where: { userId, isPinned: true, isArchived: false },
      orderBy: { updatedAt: "desc" },
      take: 6,
      select: { id: true, title: true, summary: true, updatedAt: true, category: true },
    }),

    prisma.note.findMany({
      where: { userId, isArchived: false },
      orderBy: { updatedAt: "desc" },
      take: 8,
      select: { id: true, title: true, category: true, updatedAt: true },
    }),

    prisma.note.findMany({
      where: { userId, isArchived: false },
      select: { category: true, suggestedProject: true, tags: true, updatedAt: true },
    }),

    prisma.entity.findMany({
      where: { userId },
      take: 20,
      select: { id: true, name: true, type: true, _count: { select: { notes: true } } },
    }),
  ]);

  const categories = new Set(allNotes.map((n) => n.category).filter(Boolean));
  const projects = new Set(allNotes.map((n) => n.suggestedProject).filter(Boolean));
  const tags = new Set(allNotes.flatMap((n) => n.tags));
  const lastActivity = allNotes[0]?.updatedAt ?? null;
  const topEntities = [...entities].sort((a, b) => b._count.notes - a._count.notes).slice(0, 6);

  const isEmpty = totalNotes === 0;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Your Knowledge Base</h1>
          <p className="mt-1 text-sm text-gray-500">
            {totalNotes} {totalNotes === 1 ? "note" : "notes"}
            {lastActivity && (
              <> · Last activity {new Date(lastActivity).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</>
            )}
          </p>
        </div>
        <Link
          href="/inbox"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          + New note
        </Link>
      </div>

      {isEmpty ? (
        <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-white p-12 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50">
            <span className="text-3xl">🧠</span>
          </div>
          <h2 className="text-xl font-semibold text-gray-800">Start building your knowledge base</h2>
          <p className="mt-2 text-sm text-gray-500 max-w-md mx-auto">
            Capture ideas, notes, links, and tasks. QNote organizes them automatically with AI so you can search, browse, and resurface anything.
          </p>
          <Link
            href="/inbox"
            className="mt-6 inline-block rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            Capture your first note →
          </Link>
        </div>
      ) : (
        <>
          {/* Quick Stats */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: "Total Notes", value: totalNotes },
              { label: "Categories", value: categories.size },
              { label: "Projects", value: projects.size },
              { label: "Tags", value: tags.size },
            ].map((stat) => (
              <div key={stat.label} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{stat.label}</p>
                <p className="mt-1 text-2xl font-bold text-gray-900">{stat.value}</p>
              </div>
            ))}
          </div>

          {/* Pinned Notes */}
          {pinnedNotes.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">📌 Pinned</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {pinnedNotes.map((note) => (
                  <Link
                    key={note.id}
                    href={`/notes/${note.id}`}
                    className="group rounded-xl border border-amber-200 bg-amber-50 p-4 hover:border-amber-400 hover:bg-amber-100 transition-colors"
                  >
                    <p className="font-semibold text-gray-900 group-hover:text-blue-700 line-clamp-1">
                      {note.title || "Untitled note"}
                    </p>
                    {note.summary && (
                      <p className="mt-1.5 text-sm text-gray-600 line-clamp-2">{note.summary}</p>
                    )}
                    <p className="mt-2 text-[11px] text-gray-400">
                      {new Date(note.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Recent Activity */}
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">🕐 Recent Activity</h2>
            <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100 shadow-sm">
              {recentNotes.map((note) => (
                <div key={note.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
                  <Link href={`/notes/${note.id}`} className="font-medium text-sm text-gray-900 hover:text-blue-600 flex-1 truncate mr-4">
                    {note.title || "Untitled note"}
                  </Link>
                  <div className="flex items-center gap-2 shrink-0">
                    {note.category && (
                      <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[11px] text-purple-700">{note.category}</span>
                    )}
                    <span className="text-[11px] text-gray-400">
                      {new Date(note.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Recent Entities */}
          {topEntities.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">🔗 People & Projects</h2>
              <div className="flex flex-wrap gap-2">
                {topEntities.map((entity) => (
                  <Link
                    key={entity.id}
                    href={`/entities/${entity.type}/${encodeURIComponent(entity.name)}`}
                    className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm hover:border-blue-300 hover:bg-blue-50 transition-colors"
                  >
                    <span className="text-[10px] font-semibold uppercase text-gray-400">{entity.type}</span>
                    <span className="text-gray-800">{entity.name}</span>
                    <span className="text-[11px] text-gray-400">{entity._count.notes}</span>
                  </Link>
                ))}
                <Link href="/entities" className="flex items-center rounded-full border border-dashed border-gray-300 px-3 py-1.5 text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors">
                  All entities →
                </Link>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
