import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import NoteCard from "@/components/notes/NoteCard";

/**
 * Cards page that renders notes in a responsive card grid.
 */
export default async function CardsPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const notes = await prisma.note.findMany({
    where: {
      userId: session.user.id,
      isArchived: false,
    },
    orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
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
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2 text-gray-900">Cards</h1>
        <p className="text-gray-600">
          {notes.length} note{notes.length === 1 ? "" : "s"} in your active workspace.
        </p>
      </div>

      {notes.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 p-16 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
            <span className="text-3xl">🗂️</span>
          </div>
          <p className="text-lg font-medium text-gray-700 mb-1">No notes yet</p>
          <p className="text-sm text-gray-500">Capture your first thought using the box at the top of the page.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {notes.map((note) => (
            <NoteCard key={note.id} note={note} />
          ))}
        </div>
      )}
    </div>
  );
}
