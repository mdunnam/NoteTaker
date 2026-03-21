/**
 * Left sidebar with navigation
 */

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Inbox,
  Grid3x3,
  Folder,
  Tag,
  Calendar,
  Search,
  Archive,
  Heart,
  LogOut,
} from "lucide-react";
import { signOut } from "next-auth/react";

const navigationItems = [
  { label: "Inbox", href: "/inbox", icon: Inbox },
  { label: "Cards", href: "/cards", icon: Grid3x3 },
  { label: "Projects", href: "/projects", icon: Folder },
  { label: "Topics", href: "/topics", icon: Tag },
  { label: "Timeline", href: "/timeline", icon: Calendar },
  { label: "Search", href: "/search", icon: Search },
];

const secondaryItems = [
  { label: "Favorites", href: "/favorites", icon: Heart },
  { label: "Archive", href: "/archive", icon: Archive },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-muted border-r border-border flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-sm">Q</span>
          </div>
          <h1 className="text-xl font-bold">QNote</h1>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-4">
        <div className="space-y-2">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-2 rounded-lg transition-colors ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground hover:bg-accent"
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>

        <div className="mt-6 pt-6 border-t border-border">
          <div className="text-xs font-semibold text-muted-foreground px-4 mb-3">
            OTHER
          </div>
          <div className="space-y-2">
            {secondaryItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-2 rounded-lg transition-colors ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground hover:bg-accent"
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="font-medium">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Sign out */}
      <div className="p-4 border-t border-border">
        <button
          onClick={() => signOut({ redirectTo: "/login" })}
          className="flex items-center gap-3 px-4 py-2 rounded-lg text-foreground hover:bg-destructive hover:text-destructive-foreground transition-colors w-full"
        >
          <LogOut className="w-5 h-5" />
          <span className="font-medium">Sign out</span>
        </button>
      </div>
    </aside>
  );
}
