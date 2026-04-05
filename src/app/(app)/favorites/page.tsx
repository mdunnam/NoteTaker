import { auth } from "@/auth";
import SavedNotesClient from "@/components/notes/SavedNotesClient";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";

/**
 * Favorites page that shows pinned notes.
 */
export default async function FavoritesPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const notes = await prisma.note.findMany({
    where: {
      userId: session.user.id,
      isPinned: true,
      isArchived: false,
    },
    orderBy: [{ createdAt: "desc" }],
    include: {
      collection: true,
      entities: {
        include: {
          entity: true,
        },
      },
    },
  });

  return (
    <div className="p-6">
      <h1 className="mb-2 text-3xl font-bold text-gray-900">Favorites</h1>
      <p className="mb-6 text-gray-600">
        {notes.length} pinned note{notes.length === 1 ? "" : "s"}. Keep your durable focus notes healthy, searchable, and ready to synthesize.
      </p>

      {notes.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-gray-600">
          No favorites yet. Pin notes from Inbox or Cards to see them here.
        </div>
      ) : (
        <SavedNotesClient notes={notes} mode="favorites" />
      )}
    </div>
  );
}
