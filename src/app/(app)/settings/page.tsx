import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import SettingsClient from "@/components/settings/SettingsClient";

/**
 * User settings page.
 */
export default async function SettingsPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, email: true },
  });

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="p-6">
      <h1 className="mb-2 text-3xl font-bold text-gray-900">Settings</h1>
      <p className="mb-6 text-gray-600">Manage your profile and account preferences.</p>
      <SettingsClient name={user.name} email={user.email} />
    </div>
  );
}
