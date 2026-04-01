import { auth } from "@/auth";
import SearchClient from "@/components/search/SearchClient";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";

/**
 * Search & Ask page — loads search filter options and renders the client experience.
 */
export default async function SearchPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const notes = await prisma.note.findMany({
    where: {
      userId: session.user.id,
      isArchived: false,
      status: "PROCESSED",
    },
    select: {
      category: true,
      type: true,
      tags: true,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 500,
  });

  const categories = [...new Set(notes.map((note) => note.category).filter(Boolean))] as string[];
  const types = [...new Set(notes.map((note) => note.type).filter(Boolean))] as string[];
  const tags = [...new Set(notes.flatMap((note) => note.tags))].filter(Boolean).slice(0, 40);

  return <SearchClient filterOptions={{ categories, types, tags }} />;
}
