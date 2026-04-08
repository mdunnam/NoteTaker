import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { EntityType } from "@prisma/client";

interface Props {
  params: { type: string; name: string };
}

const TYPE_COLORS: Record<string, string> = {
  PERSON: "bg-blue-100 text-blue-700",
  PROJECT: "bg-green-100 text-green-700",
  APP: "bg-purple-100 text-purple-700",
  COMPANY: "bg-orange-100 text-orange-700",
  PLACE: "bg-rose-100 text-rose-700",
  TOPIC: "bg-gray-100 text-gray-700",
};

export default async function EntityDetailPage({ params }: Props) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const name = decodeURIComponent(params.name);
  const typeUpper = params.type.toUpperCase();

  // Validate type is a valid EntityType enum value
  const validTypes = Object.values(EntityType) as string[];
  if (!validTypes.includes(typeUpper)) notFound();
  const type = typeUpper as EntityType;

  const entity = await prisma.entity.findFirst({
    where: { userId: session.user.id, name, type },
    include: {
      notes: {
        include: {
          note: {
            select: {
              id: true,
              title: true,
              summary: true,
              tags: true,
              category: true,
              updatedAt: true,
              isArchived: true,
            },
          },
        },
      },
    },
  });

  if (!entity) notFound();

  const activeNotes = entity.notes
    .filter((ne) => !ne.note.isArchived)
    .sort((a, b) => new Date(b.note.updatedAt).getTime() - new Date(a.note.updatedAt).getTime());

  const mentionCount = entity.notes.length;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <Link href="/entities" className="text-sm text-blue-600 hover:underline">
          ← People &amp; Projects
        </Link>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-3xl font-bold text-gray-900">{entity.name}</h1>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${TYPE_COLORS[typeUpper] ?? "bg-gray-100 text-gray-700"}`}>
          {typeUpper}
        </span>
        <span className="text-sm text-gray-500">
          {mentionCount} mention{mentionCount === 1 ? "" : "s"}
        </span>
      </div>

      {activeNotes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center text-gray-500">
          No active notes mention this entity.
        </div>
      ) : (
        <div className="space-y-3">
          {activeNotes.map(({ note }) => (
            <Link
              key={note.id}
              href={`/notes/${note.id}`}
              className="block rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:border-blue-300 hover:bg-blue-50/30 transition-colors"
            >
              <p className="font-semibold text-gray-900 hover:text-blue-700">
                {note.title || "Untitled note"}
              </p>
              {note.summary && (
                <p className="mt-1 text-sm text-gray-600 line-clamp-2">{note.summary}</p>
              )}
              <div className="mt-2 flex flex-wrap gap-1.5 items-center">
                {note.category && (
                  <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[11px] text-purple-700">
                    {note.category}
                  </span>
                )}
                {note.tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">
                    #{tag}
                  </span>
                ))}
                <span className="text-[11px] text-gray-400 ml-auto">
                  {new Date(note.updatedAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
