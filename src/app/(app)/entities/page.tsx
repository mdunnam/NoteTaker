import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { redirect } from "next/navigation";

const TYPE_ORDER = ["PERSON", "PROJECT", "APP", "COMPANY", "PLACE", "TOPIC"];

const TYPE_COLORS: Record<string, string> = {
  PERSON: "bg-blue-100 text-blue-700",
  PROJECT: "bg-green-100 text-green-700",
  APP: "bg-purple-100 text-purple-700",
  COMPANY: "bg-orange-100 text-orange-700",
  PLACE: "bg-rose-100 text-rose-700",
  TOPIC: "bg-gray-100 text-gray-700",
};

export default async function EntitiesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const entities = await prisma.entity.findMany({
    where: { userId: session.user.id },
    orderBy: [{ type: "asc" }, { mentionCount: "desc" }],
    select: { id: true, name: true, type: true, mentionCount: true },
  });

  const grouped = TYPE_ORDER.reduce<Record<string, typeof entities>>((acc, type) => {
    acc[type] = entities.filter((e) => e.type === type);
    return acc;
  }, {});

  const hasAny = entities.length > 0;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">People &amp; Projects</h1>
        <p className="mt-1 text-sm text-gray-500">{entities.length} entities extracted from your notes</p>
      </div>

      {!hasAny ? (
        <div className="rounded-xl border border-dashed border-gray-200 p-10 text-center text-gray-500">
          No entities yet. As you add notes, QNote will automatically detect people, projects, apps, and more.
        </div>
      ) : (
        TYPE_ORDER.map((type) => {
          const group = grouped[type];
          if (!group || group.length === 0) return null;
          return (
            <section key={type}>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">{type}S</h2>
              <div className="flex flex-wrap gap-2">
                {group.map((entity) => (
                  <Link
                    key={entity.id}
                    href={`/entities/${entity.type}/${encodeURIComponent(entity.name)}`}
                    className={`flex items-center gap-2 rounded-full border border-transparent px-3 py-1.5 text-sm font-medium hover:opacity-80 transition-opacity ${TYPE_COLORS[type] ?? "bg-gray-100 text-gray-700"}`}
                  >
                    {entity.name}
                    <span className="text-[11px] opacity-60">{entity.mentionCount}</span>
                  </Link>
                ))}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
