import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/user";
import NeroClient from "./NeroClient";

export default async function NeroPage() {
  const userId = await getUserId();
  const messages = await prisma.message.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    take: 100,
  });
  return (
    <NeroClient
      initialMessages={messages.map((m) => ({
        id: m.id,
        role: m.role.toLowerCase() as "user" | "assistant",
        content: m.content,
        createdAt: m.createdAt.toISOString(),
      }))}
    />
  );
}