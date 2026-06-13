"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const nav = [
  { href: "/dashboard", label: "Today",    icon: "◈" },
  { href: "/tasks",     label: "Tasks",    icon: "✓" },
  { href: "/habits",    label: "Habits",   icon: "⬡" },
  { href: "/projects",  label: "Projects", icon: "◇" },
  { href: "/notes",     label: "Notes",    icon: "≡" },
  { href: "/nero",      label: "Nero",     icon: "◉" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex flex-col w-56 shrink-0 bg-[var(--bg-surface)] border-r border-[var(--border)] h-screen">
      {/* Brand */}
      <div className="px-5 py-6 border-b border-[var(--border)]">
        <span className="text-lg font-bold tracking-tight text-white">Nero</span>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">Your daily assistant</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {nav.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? "bg-[var(--accent-soft)] text-white"
                  : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-white"
              }`}
            >
              <span className="text-base w-4 text-center opacity-80">{item.icon}</span>
              {item.label}
              {item.href === "/nero" && (
                <span className="ml-auto w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-[var(--border)]">
        <p className="text-xs text-[var(--text-muted)]">
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
        </p>
      </div>
    </aside>
  );
}
