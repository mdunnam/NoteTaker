import type { Metadata } from "next";
import "./globals.css";
import { SessionProvider } from "next-auth/react";
import { auth } from "@/auth";
import PwaRegistration from "@/components/layout/PwaRegistration";

export const metadata: Metadata = {
  title: "QNote - AI-Assisted Note Inbox",
  description: "Capture thoughts fast, let AI organize, resurface what matters",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/favicon.svg",
  },
  appleWebApp: {
    capable: true,
    title: "QNote",
    statusBarStyle: "default",
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  return (
    <html lang="en">
      <body>
        <SessionProvider session={session}>
          <PwaRegistration />
          {children}
        </SessionProvider>
      </body>
    </html>
  );
}
