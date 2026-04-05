import { auth } from "@/auth";
import TimelineClient from "@/components/notes/TimelineClient";
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
      type: true,
      status: true,
      confidenceScore: true,
      priority: true,
      suggestedProject: true,
      extractedTasks: true,
      aiMeta: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return (
    <div className="p-6">
      <h1 className="mb-2 text-3xl font-bold text-gray-900">Timeline</h1>
      <p className="mb-6 text-gray-600">Browse your notes by month, health, and shared time-window context.</p>

      {notes.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-gray-600">
          No notes yet.
        </div>
      ) : (
        <TimelineClient notes={notes} />
      )}
    </div>
  );
}
