import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/user";
import NotesClient from "./NotesClient";

export default async function NotesPage() {
  const userId = await getUserId();
  const notes = await prisma.note.findMany({
    where: { userId },
    orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
    take: 100,
  });
  return (
    <NotesClient
      initialNotes={notes.map((n) => ({
        id: n.id, title: n.title, content: n.content,
        tags: n.tags, isPinned: n.isPinned,
        createdAt: n.createdAt.toISOString(),
        updatedAt: n.updatedAt.toISOString(),
      }))}
    />
  );
}