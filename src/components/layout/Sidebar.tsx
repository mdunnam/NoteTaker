/**
 * Left sidebar with navigation
 */

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Inbox,
  ClipboardCheck,
  Layers,
  Search,
  LogOut,
  Settings,
  ChevronDown,
  ChevronRight,
  Archive,
  Heart,
  Upload,
  Calendar,
  Grid3x3,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { useState } from "react";

const primaryItems = [
  {
    label: "Inbox",
    href: "/inbox",
    icon: Inbox,
    description: "Your latest captures",
  },
  {
    label: "Needs Attention",
    href: "/review",
    icon: ClipboardCheck,
    description: "AI flagged for review",
  },
  {
    label: "Organize",
    href: "/projects",
    icon: Layers,
    description: "Projects, topics & clusters",
  },
  {
    label: "Search",
    href: "/search",
    icon: Search,
    description: "Find anything",
  },
];

const moreItems = [
  { label: "Cards", href: "/cards", icon: Grid3x3 },
  { label: "Timeline", href: "/timeline", icon: Calendar },
  { label: "Favorites", href: "/favorites", icon: Heart },
  { label: "Archive", href: "/archive", icon: Archive },
  { label: "Import", href: "/import", icon: Upload },
  { label: "Settings", href: "/settings", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const isMoreActive = moreItems.some((item) => pathname === item.href);

  return (
    <aside className="w-56 bg-gray-50 border-r border-gray-200 flex flex-col">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
            <span className="text-white font-bold text-xs">Q</span>
          </div>
          <h1 className="text-lg font-bold tracking-tight">QNote</h1>
        </div>
        <p className="text-[11px] text-gray-400 mt-1 leading-tight">Capture. Organize. Resurface.</p>
      </div>

      {/* Primary Navigation */}
      <nav className="flex-1 overflow-y-auto p-3">
        <div className="space-y-1">
          {primaryItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href ||
              // Treat /topics and /collections as also active under Organize
              (item.href === "/projects" && ["/topics", "/collections"].includes(pathname));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors group ${
                  isActive
                    ? "bg-blue-600 text-white"
                    : "text-gray-700 hover:bg-gray-200"
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-medium leading-tight">{item.label}</div>
                  <div className={`text-[10px] leading-tight truncate ${
                    isActive ? "text-blue-100" : "text-gray-400"
                  }`}>{item.description}</div>
                </div>
              </Link>
            );
          })}
        </div>

        {/* More section */}
        <div className="mt-4 pt-4 border-t border-gray-200">
          <button
            onClick={() => setMoreOpen((prev) => !prev)}
            className={`flex items-center justify-between w-full px-3 py-2 rounded-lg text-sm transition-colors ${
              isMoreActive && !moreOpen
                ? "bg-blue-50 text-blue-700"
                : "text-gray-500 hover:bg-gray-200"
            }`}
          >
            <span className="font-medium text-xs uppercase tracking-wide">More views</span>
            {moreOpen ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
          </button>

          {moreOpen && (
            <div className="mt-1 space-y-0.5">
              {moreItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm ${
                      isActive
                        ? "bg-blue-600 text-white"
                        : "text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </nav>

      {/* Sign out */}
      <div className="p-3 border-t border-gray-200">
        <button
          onClick={() => signOut({ redirectTo: "/login" })}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors w-full text-sm"
        >
          <LogOut className="w-4 h-4" />
          <span>Sign out</span>
        </button>
      </div>
    </aside>
  );
}
