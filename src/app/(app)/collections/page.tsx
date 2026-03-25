import { auth } from "@/auth";
import CollectionsClient from "@/components/collections/CollectionsClient";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";

/**
 * Collections management page.
 */
export default async function CollectionsPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const collections = await prisma.collection.findMany({
    where: { userId: session.user.id },
    orderBy: { name: "asc" },
    include: {
      _count: {
        select: { notes: true },
      },
    },
  });

  return (
    <div className="p-6">
      <h1 className="mb-2 text-3xl font-bold text-gray-900">Collections</h1>
      <CollectionsClient initialCollections={collections} />
    </div>
  );
}
