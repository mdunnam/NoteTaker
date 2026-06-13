"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Task { id: string; title: string; priority: string; status: string; dueDate: string | null; notes: string | null; projectId: string | null; }
interface Habit { id: string; name: string; icon: string | null; color: string | null; completedToday: boolean; }
interface Project { id: string; name: string; color: string | null; taskCount: number; }
interface RecentNote { id: string; title: string | null; content: string; createdAt: string; }
interface Stats { dueTodayCount: number; habitsCompleted: number; habitsTotal: number; }
interface CalEvent { id: string; title: string; start: string; end: string; isAllDay: boolean; attendees: number; meetLink: string | null; }
interface SlackItem { text: string; from: string; channel: string; permalink: string; isDm: boolean; ts: string; }

interface Props {
  events: CalEvent[];
  slackItems: SlackItem[];
  tasks: Task[];
  habits: Habit[];
  projects: Project[];
  recentNotes: RecentNote[];
  stats: Stats;
}

const priorityColor: Record<string, string> = {
  HIGH: "text-red-400",
  MEDIUM: "text-amber-400",
  LOW: "text-slate-500",
};

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function DashboardClient({ events, slackItems, tasks, habits, projects, recentNotes, stats }: Props) {
  const router = useRouter();
  const [localHabits, setLocalHabits] = useState(habits);
  const [localTasks, setLocalTasks] = useState(tasks);
  const [newTask, setNewTask] = useState("");
  const [adding, setAdding] = useState(false);

  const greeting = getGreeting();
  const dateStr = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const allDone = stats.habitsTotal > 0 && localHabits.every((h) => h.completedToday);

  async function toggleHabit(habitId: string, current: boolean) {
    setLocalHabits((prev) => prev.map((h) => h.id === habitId ? { ...h, completedToday: !current } : h));
    try {
      await fetch(`/api/habits/${habitId}/log`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: !current }),
      });
    } catch {
      setLocalHabits((prev) => prev.map((h) => h.id === habitId ? { ...h, completedToday: current } : h));
    }
  }

  async function completeTask(taskId: string) {
    setLocalTasks((prev) => prev.filter((t) => t.id !== taskId));
    await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "DONE" }),
    });
  }

  async function addQuickTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTask.trim()) return;
    setAdding(true);
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTask.trim() }),
    });
    if (res.ok) {
      const task = await res.json();
      setLocalTasks((prev) => [task, ...prev]);
      setNewTask("");
    }
    setAdding(false);
  }

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">{greeting}, Mike.</h1>
          <p className="mt-1 text-[var(--text-muted)]">{dateStr}</p>
        </div>
        <Link
          href="/nero"
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <span className="animate-pulse">◉</span> Talk to Nero
        </Link>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Due today", value: stats.dueTodayCount, sub: "tasks", href: "/tasks" },
          {
            label: "Habits",
            value: `${localHabits.filter((h) => h.completedToday).length}/${stats.habitsTotal}`,
            sub: allDone ? "all done today" : "done today",
            href: "/habits",
          },
          { label: "Projects", value: projects.length, sub: "active", href: "/projects" },
        ].map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="block rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] p-4 hover:border-[var(--accent)] transition-colors group"
          >
            <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">{s.label}</p>
            <p className="mt-1 text-3xl font-bold text-white group-hover:text-[var(--accent)] transition-colors">{s.value}</p>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">{s.sub}</p>
          </Link>
        ))}
      </div>

      {slackItems.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-3">Slack — Needs a Look</h2>
          <div className="space-y-1">
            {slackItems.slice(0, 5).map((s) => (
              <a key={s.ts} href={s.permalink} target="_blank" rel="noreferrer"
                className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] hover:border-[var(--accent)] transition-colors">
                <span className={`text-xs font-semibold px-1.5 py-0.5 rounded shrink-0 ${s.isDm ? "bg-[var(--accent-soft)] text-white" : "bg-[var(--bg-hover)] text-[var(--text-secondary)]"}`}>{s.channel}</span>
                <span className="text-sm text-white font-medium shrink-0">{s.from}</span>
                <span className="text-sm text-[var(--text-secondary)] truncate">{s.text}</span>
              </a>
            ))}
          </div>
        </section>
      )}

      {events.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-3">Today&apos;s Meetings</h2>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {events.map((e) => {
              const now = new Date();
              const isPast = new Date(e.end) < now;
              const isNow = new Date(e.start) <= now && now <= new Date(e.end);
              return (
                <div key={e.id} className={`shrink-0 rounded-xl border px-4 py-3 min-w-[180px] ${isNow ? "border-[var(--accent)] bg-[var(--accent-soft)]" : isPast ? "border-[var(--border)] bg-[var(--bg-elevated)] opacity-40" : "border-[var(--border)] bg-[var(--bg-elevated)]"}`}>
                  <p className="text-xs text-[var(--text-muted)]">
                    {e.isAllDay ? "All day" : new Date(e.start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                    {isNow && <span className="ml-2 text-[var(--accent)] font-semibold">NOW</span>}
                  </p>
                  <p className="text-sm text-white font-medium mt-0.5 truncate max-w-[220px]">{e.title}</p>
                  {e.attendees > 1 && <p className="text-xs text-[var(--text-muted)] mt-0.5">{e.attendees} people</p>}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <div className="grid grid-cols-5 gap-6">
        {/* Tasks — 3 cols */}
        <section className="col-span-3 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wide">Today&apos;s Tasks</h2>
            <Link href="/tasks" className="text-xs text-[var(--accent)] hover:underline">All tasks</Link>
          </div>

          {/* Quick add */}
          <form onSubmit={addQuickTask} className="flex gap-2">
            <input
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              placeholder="Add a task..."
              className="flex-1 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors"
            />
            <button
              type="submit"
              disabled={adding || !newTask.trim()}
              className="px-3 py-2 bg-[var(--accent)] text-white text-sm rounded-lg disabled:opacity-40 hover:opacity-90 transition-opacity"
            >
              +
            </button>
          </form>

          <div className="space-y-1">
            {localTasks.length === 0 && (
              <p className="text-[var(--text-muted)] text-sm py-4 text-center">All clear.</p>
            )}
            {localTasks.slice(0, 10).map((task) => (
              <div
                key={task.id}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[var(--bg-elevated)] border border-transparent hover:border-[var(--border)] group transition-colors"
              >
                <button
                  onClick={() => completeTask(task.id)}
                  className="w-4 h-4 rounded border border-[var(--text-muted)] flex items-center justify-center shrink-0 hover:border-[var(--accent)] hover:bg-[var(--accent)] transition-colors text-xs"
                  title="Mark done"
                />
                <span className="flex-1 text-sm text-[var(--text-primary)] truncate">{task.title}</span>
                <span className={`text-xs font-medium ${priorityColor[task.priority] ?? ""}`}>{task.priority}</span>
              </div>
            ))}
            {localTasks.length > 10 && (
              <p className="text-xs text-[var(--text-muted)] text-center pt-1">+{localTasks.length - 10} more</p>
            )}
          </div>
        </section>

        {/* Habits + Notes — 2 cols */}
        <div className="col-span-2 space-y-6">
          {/* Habits */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wide">Habits</h2>
              <Link href="/habits" className="text-xs text-[var(--accent)] hover:underline">All</Link>
            </div>
            <div className="space-y-1">
              {localHabits.length === 0 && (
                <p className="text-[var(--text-muted)] text-sm py-3 text-center">
                  <Link href="/habits" className="text-[var(--accent)] hover:underline">Add your first habit</Link>
                </p>
              )}
              {localHabits.map((habit) => (
                <button
                  key={habit.id}
                  onClick={() => toggleHabit(habit.id, habit.completedToday)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-left ${
                    habit.completedToday
                      ? "bg-[var(--accent-soft)] border border-[var(--accent)] text-white"
                      : "bg-[var(--bg-elevated)] border border-transparent hover:border-[var(--border)] text-[var(--text-secondary)]"
                  }`}
                >
                  <span className="text-base">{habit.icon ?? "○"}</span>
                  <span className="text-sm flex-1">{habit.name}</span>
                  {habit.completedToday && <span className="text-xs text-[var(--accent)]">✓</span>}
                </button>
              ))}
            </div>
          </section>

          {/* Recent notes */}
          {recentNotes.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wide">Recent Notes</h2>
                <Link href="/notes" className="text-xs text-[var(--accent)] hover:underline">All</Link>
              </div>
              <div className="space-y-1">
                {recentNotes.map((note) => (
                  <Link
                    key={note.id}
                    href={`/notes/${note.id}`}
                    className="block px-3 py-2 rounded-lg bg-[var(--bg-elevated)] hover:border hover:border-[var(--border)] transition-colors"
                  >
                    <p className="text-sm text-[var(--text-primary)] truncate">{note.title ?? note.content}</p>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">
                      {new Date(note.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      {/* Active projects */}
      {projects.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wide">Active Projects</h2>
            <Link href="/projects" className="text-xs text-[var(--accent)] hover:underline">All</Link>
          </div>
          <div className="flex gap-3 flex-wrap">
            {projects.map((p) => (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] hover:border-[var(--accent)] transition-colors text-sm text-[var(--text-primary)]"
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color ?? "#7c3aed" }} />
                {p.name}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
