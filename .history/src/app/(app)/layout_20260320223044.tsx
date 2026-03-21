/**
 * Authenticated app shell layout
 * Contains sidebar, main content area, and right panel
 */

import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Sidebar from "@/components/layout/Sidebar";
import CaptureBar from "@/components/layout/CaptureBar";
import RightPanel from "@/components/layout/RightPanel";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session || !session.user) {
    redirect("/login");
  }

  return (
    <div className="flex h-screen overflow-hidden bg-white text-gray-900\">
      {/* Sidebar */}
      <Sidebar />

      {/* Main content area */}
      <div className="flex-1 flex flex-col\">
        {/* Universal capture bar */}
        <CaptureBar />

        {/* Rest of the content */}
        <div className="flex flex-1 overflow-hidden\">
          <main className="flex-1 overflow-y-auto\">
            {children}
          </main>

          {/* Right panel with AI insights */}
          <RightPanel />
        </div>
      </div>
    </div>
  );
}
