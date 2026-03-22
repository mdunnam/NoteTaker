import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";

interface SearchPageProps {
  searchParams?: {
    q?: string;
  };
}

/**
 * Search page for keyword-based note lookup.
 */
export default async function SearchPage({ searchParams }: SearchPageProps) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const query = (searchParams?.q || "").trim();

  const notes = await prisma.note.findMany({
    where: {
      userId: session.user.id,
      isArchived: false,
      ...(query
        ? {
            OR: [
              { rawContent: { contains: query, mode: "insensitive" } },
              { title: { contains: query, mode: "insensitive" } },
              { summary: { contains: query, mode: "insensitive" } },
              { tags: { has: query } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 40,
  });

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-4 text-gray-900">Search & Ask</h1>

      <form method="GET" className="mb-6">
        <div className="flex gap-2">
          <input
            type="text"
            name="q"
            defaultValue={query}
            placeholder="Search notes, summaries, tags..."
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
          <button
            type="submit"
            className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
          >
            Search
          </button>
        </div>
      </form>

      {query && (
        <p className="mb-4 text-sm text-gray-600">
          {notes.length} result{notes.length === 1 ? "" : "s"} for &quot;{query}&quot;.
        </p>
      )}

      {!query ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-gray-600">
          Start by typing a keyword to search your notes.
        </div>
      ) : notes.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-gray-600">
          No results found. Try a different keyword.
        </div>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <div key={note.id} className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="mb-1 text-xs text-gray-500">
                {new Date(note.createdAt).toLocaleString()}
              </div>
              <div className="mb-2 text-lg font-semibold text-gray-900">
                {note.title || "Untitled note"}
              </div>
              <p className="mb-2 text-sm text-gray-700 line-clamp-3">{note.summary || note.rawContent}</p>
              <Link href="/inbox" className="text-sm text-blue-600 hover:underline">
                Open in inbox
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
