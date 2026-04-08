import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getOrCreateDigest } from "@/lib/dailyDigest";
import DashboardClient from "@/components/dashboard/DashboardClient";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const dateStr = new Date().toISOString().split("T")[0];
  const digest = await getOrCreateDigest(session.user.id, dateStr);

  return <DashboardClient digest={digest} dateStr={dateStr} />;
}
