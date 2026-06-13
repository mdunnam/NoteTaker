import { getSystemUser } from "@/lib/user";
import Sidebar from "@/components/nero/Sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await getSystemUser();

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--bg-base)] text-[var(--text-primary)]">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
