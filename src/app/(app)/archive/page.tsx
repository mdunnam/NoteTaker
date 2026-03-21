import { auth } from "@/auth";
import NoteCard from "@/components/notes/NoteCard";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";

/**
 * Archive page that shows archived notes.
 */
export default async function ArchivePage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const notes = await prisma.note.findMany({
    where: {
      userId: session.user.id,
      isArchived: true,
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
      <h1 className="mb-2 text-3xl font-bold text-gray-900">Archive</h1>
      <p className="mb-6 text-gray-600">
        {notes.length} archived note{notes.length === 1 ? "" : "s"}.
      </p>

      {notes.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-gray-600">
          Archive is empty.
        </div>
      ) : (
        <div className="space-y-4 max-w-3xl">
          {notes.map((note) => (
            <NoteCard key={note.id} note={note} />
          ))}
        </div>
      )}
    </div>
  );
}
