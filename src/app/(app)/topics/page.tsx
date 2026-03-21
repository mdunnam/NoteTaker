import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";

/**
 * Topics page grouped by note category and top tags.
 */
export default async function TopicsPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const notes = await prisma.note.findMany({
    where: {
      userId: session.user.id,
      isArchived: false,
    },
    select: {
      id: true,
      category: true,
      tags: true,
    },
  });

  const categoryCounts = notes.reduce<Record<string, number>>((acc, note) => {
    const key = note.category || "Uncategorized";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const tagCounts = notes.reduce<Record<string, number>>((acc, note) => {
    for (const tag of note.tags || []) {
      const normalized = tag.trim();
      if (!normalized) continue;
      acc[normalized] = (acc[normalized] || 0) + 1;
    }
    return acc;
  }, {});

  const topCategories = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1]);
  const topTags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-2 text-gray-900">Topics</h1>
      <p className="mb-6 text-gray-600">Quick clusters from your note categories and tags.</p>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="mb-3 text-lg font-semibold text-gray-900">Categories</h2>
          {topCategories.length === 0 ? (
            <p className="text-gray-600">No categorized notes yet.</p>
          ) : (
            <ul className="space-y-2">
              {topCategories.map(([category, count]) => (
                <li key={category} className="flex items-center justify-between rounded border border-gray-100 px-3 py-2">
                  <span className="text-sm font-medium text-gray-800">{category}</span>
                  <span className="text-xs text-gray-600">{count}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="mb-3 text-lg font-semibold text-gray-900">Top Tags</h2>
          {topTags.length === 0 ? (
            <p className="text-gray-600">No tags yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {topTags.map(([tag, count]) => (
                <span
                  key={tag}
                  className="rounded-full bg-purple-100 px-3 py-1 text-xs font-medium text-purple-700"
                >
                  #{tag} ({count})
                </span>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
