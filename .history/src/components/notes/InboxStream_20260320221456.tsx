/**
 * Inbox stream - shows notes in a vertical list for triage
 */

"use client";

import { Note, NoteStatus } from "@prisma/client";
import NoteCard from "./NoteCard";

interface InboxStreamProps {
  notes: (Note & {
    collection: { id: string; name: string; color?: string | null } | null;
    entities: Array<{ entity: { id: string; name: string; type: string } }>;
  })[];
}

export default function InboxStream({ notes }: InboxStreamProps) {
  if (notes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-lg text-muted-foreground mb-2">No notes yet</p>
        <p className="text-sm text-muted-foreground">
          Start capturing above to see your notes here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-3xl">
      {notes.map((note) => (
        <NoteCard key={note.id} note={note} />
      ))}
    </div>
  );
}
