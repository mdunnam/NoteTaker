import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";

/**
 * Timeline page grouped by month-year buckets.
 */
export default async function TimelinePage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const notes = await prisma.note.findMany({
    where: {
      userId: session.user.id,
      isArchived: false,
    },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
      title: true,
      summary: true,
      rawContent: true,
      category: true,
      createdAt: true,
    },
  });

  const grouped = notes.reduce<Record<string, typeof notes>>((acc, note) => {
    const key = new Date(note.createdAt).toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });

    acc[key] = acc[key] || [];
    acc[key].push(note);
    return acc;
  }, {});

  const buckets = Object.entries(grouped);

  return (
    <div className="p-6">
      <h1 className="mb-2 text-3xl font-bold text-gray-900">Timeline</h1>
      <p className="mb-6 text-gray-600">Browse your notes by month.</p>

      {buckets.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-gray-600">
          No notes yet.
        </div>
      ) : (
        <div className="space-y-6">
          {buckets.map(([bucket, bucketNotes]) => (
            <section key={bucket} className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">{bucket}</h2>
                <span className="text-xs text-gray-600">{bucketNotes.length} notes</span>
              </div>

              <ul className="space-y-2">
                {bucketNotes.map((note) => (
                  <li key={note.id} className="rounded border border-gray-100 p-3">
                    <div className="mb-1 text-xs text-gray-500">
                      {new Date(note.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </div>
                    <div className="text-sm font-semibold text-gray-900">
                      {note.title || "Untitled note"}
                    </div>
                    <div className="mt-1 text-sm text-gray-700 line-clamp-2">
                      {note.summary || note.rawContent}
                    </div>
                    {note.category && (
                      <div className="mt-2 inline-block rounded-full bg-purple-100 px-2 py-1 text-xs text-purple-700">
                        {note.category}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
