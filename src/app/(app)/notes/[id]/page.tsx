import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import NoteDetailClient from "@/components/notes/NoteDetailClient";
import { getThinkingMemory, getThinkingMemoryHints } from "@/lib/userMemory";

interface NoteDetailPageProps {
  params: { id: string };
}

/**
 * Full-page note detail view with AI insights, entities, related notes, and editing.
 */
export default async function NoteDetailPage({ params }: NoteDetailPageProps) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const note = await prisma.note.findFirst({
    where: { id: params.id, userId: session.user.id },
    include: {
      collection: true,
      entities: {
        include: { entity: true },
      },
      relatedNotesFrom: {
        include: {
          targetNote: {
            select: { id: true, title: true, summary: true, createdAt: true },
          },
        },
        orderBy: { score: "desc" },
        take: 5,
      },
      relatedNotesTo: {
        include: {
          sourceNote: {
            select: { id: true, title: true, summary: true, createdAt: true },
          },
        },
        orderBy: { score: "desc" },
        take: 5,
      },
    },
  });

  if (!note) {
    notFound();
  }

  const memory = await getThinkingMemory(session.user.id);
  const quickHints = getThinkingMemoryHints(memory);

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-4">
        <Link href="/home" className="text-sm text-blue-600 hover:underline">
          ← Home
        </Link>
      </div>

      <NoteDetailClient note={note} quickHints={quickHints} />
    </div>
  );
}
