/**
 * Inbox page - main triage view for new/unprocessed notes
 */

import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import InboxStream from "@/components/notes/InboxStream";

export default async function InboxPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const notes = await prisma.note.findMany({
    where: {
      userId: session.user.id,
      status: { in: ["UNPROCESSED", "PROCESSED"] },
      isArchived: false,
    },
    orderBy: {
      createdAt: "desc",
    },
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
        <h1 className="text-3xl font-bold tracking-tight">Inbox</h1>
        <p className="text-muted-foreground mt-2">
          {notes.length === 0
            ? "No notes yet. Start capturing!"
            : `${notes.length} note${notes.length !== 1 ? "s" : ""}`}
        </p>
      </div>

      <InboxStream notes={notes} />
    </div>
  );
}
