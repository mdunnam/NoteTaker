import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";

/**
 * Projects page grouped by AI-suggested project and fallback category.
 */
export default async function ProjectsPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const notes = await prisma.note.findMany({
    where: {
      userId: session.user.id,
      isArchived: false,
    },
    orderBy: { createdAt: "desc" },
  });

  const grouped = notes.reduce<Record<string, typeof notes>>((acc, note) => {
    const key = note.suggestedProject || note.category || "Unsorted";
    acc[key] = acc[key] || [];
    acc[key].push(note);
    return acc;
  }, {});

  const groupEntries = Object.entries(grouped).sort((a, b) => b[1].length - a[1].length);

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-2 text-gray-900">Projects</h1>
      <p className="mb-6 text-gray-600">Notes grouped by AI-inferred projects and categories.</p>

      {groupEntries.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-gray-600">
          No notes available yet.
        </div>
      ) : (
        <div className="space-y-4">
          {groupEntries.map(([name, groupNotes]) => (
            <section key={name} className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">{name}</h2>
                <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700">
                  {groupNotes.length}
                </span>
              </div>
              <ul className="space-y-2">
                {groupNotes.slice(0, 6).map((note) => (
                  <li key={note.id} className="rounded border border-gray-100 p-3">
                    <div className="text-sm font-medium text-gray-900">{note.title || "Untitled note"}</div>
                    <div className="mt-1 text-sm text-gray-600 line-clamp-2">{note.summary || note.rawContent}</div>
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
