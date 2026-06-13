import { prisma } from "@/lib/db";

let cachedUserId: string | null = null;

export async function getSystemUser() {
  if (cachedUserId) {
    return { id: cachedUserId };
  }

  let user = await prisma.user.findFirst();
  if (!user) {
    user = await prisma.user.create({ data: { name: "Mike" } });
  }

  cachedUserId = user.id;
  return user;
}

export async function getUserId(): Promise<string> {
  const user = await getSystemUser();
  return user.id;
}
