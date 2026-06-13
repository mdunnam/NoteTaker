"use client";
import { useState } from "react";
import Link from "next/link";

interface OpenTask { id: string; title: string; priority: string; status: string; }
interface Project { id: string; name: string; description: string | null; status: string; color: string | null; icon: string | null; taskCount: number; openTasks: OpenTask[]; createdAt: string; }

const COLORS = ["#7c3aed","#2563eb","#16a34a","#dc2626","#ea580c","#0891b2","#db2777","#ca8a04"];
const statusColors: Record<string, string> = { ACTIVE: "text-green-400", ON_HOLD: "text-amber-400", COMPLETED: "text-blue-400", ARCHIVED: "text-slate-500" };

export default function ProjectsClient({ initialProjects }: { initialProjects: Project[] }) {
  const [projects, setProjects] = useState(initialProjects);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", color: "#7c3aed", icon: "" });
  const [saving, setSaving] = useState(false);

  async function addProject(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    const res = await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    if (res.ok) {
      const p = await res.json();
      setProjects((prev) => [{ ...p, taskCount: 0, openTasks: [] }, ...prev]);
      setForm({ name: "", description: "", color: "#7c3aed", icon: "" });
      setShowForm(false);
    }
    setSaving(false);
  }

  async function archiveProject(id: string) {
    setProjects((prev) => prev.map((p) => p.id === id ? { ...p, status: "ARCHIVED" } : p));
    await fetch(`/api/projects/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "ARCHIVED" }) });
  }

  const active = projects.filter((p) => p.status === "ACTIVE" || p.status === "ON_HOLD");
  const archived = projects.filter((p) => p.status === "COMPLETED" || p.status === "ARCHIVED");

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Projects</h1>
        <button onClick={() => setShowForm(!showForm)} className="px-4 py-2 bg-[var(--accent)] text-white text-sm rounded-lg hover:opacity-90">+ New project</button>
      </div>

      {showForm && (
        <form onSubmit={addProject} className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl p-5 space-y-3">
          <div className="flex gap-3">
            <input value={form.icon} onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))} placeholder="Icon" maxLength={2}
              className="w-14 text-center bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--accent)]" />
            <input autoFocus value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Project name"
              className="flex-1 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]" />
          </div>
          <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Description (optional)"
            className="w-full bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]" />
          <div className="flex gap-2 flex-wrap">
            {COLORS.map((c) => (
              <button key={c} type="button" onClick={() => setForm((f) => ({ ...f, color: c }))}
                className={`w-6 h-6 rounded-full hover:scale-110 transition-transform ${form.color === c ? "ring-2 ring-white ring-offset-2 ring-offset-[var(--bg-elevated)]" : ""}`}
                style={{ backgroundColor: c }} />
            ))}
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="px-4 py-2 bg-[var(--accent)] text-white text-sm rounded-lg disabled:opacity-40">{saving ? "Saving..." : "Create"}</button>
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-[var(--text-secondary)] text-sm hover:text-white">Cancel</button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {active.length === 0 && !showForm && (
          <div className="col-span-full text-center py-16 text-[var(--text-muted)]">No active projects. Create one above.</div>
        )}
        {active.map((project) => (
          <div key={project.id} className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl p-5 space-y-3 hover:border-[var(--accent)]/40 transition-colors group">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-lg" style={{ backgroundColor: (project.color ?? "#7c3aed") + "22" }}>
                  {project.icon ?? "◇"}
                </div>
                <div>
                  <h3 className="font-semibold text-white text-sm">{project.name}</h3>
                  <span className={`text-xs ${statusColors[project.status] ?? "text-slate-500"}`}>{project.status.toLowerCase().replace("_"," ")}</span>
                </div>
              </div>
              <button onClick={() => archiveProject(project.id)} className="opacity-0 group-hover:opacity-100 text-[var(--text-muted)] hover:text-amber-400 text-xs transition-all">archive</button>
            </div>
            {project.description && <p className="text-xs text-[var(--text-muted)]">{project.description}</p>}
            {project.openTasks.length > 0 && (
              <div className="space-y-1 border-t border-[var(--border)] pt-3">
                {project.openTasks.slice(0, 3).map((t) => (
                  <div key={t.id} className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] shrink-0" />
                    <span className="truncate">{t.title}</span>
                  </div>
                ))}
                {project.openTasks.length > 3 && <p className="text-xs text-[var(--text-muted)]">+{project.openTasks.length - 3} more</p>}
              </div>
            )}
            <div className="flex items-center justify-between text-xs text-[var(--text-muted)] border-t border-[var(--border)] pt-2">
              <span>{project.taskCount} total tasks</span>
              <Link href={`/tasks?projectId=${project.id}`} className="text-[var(--accent)] hover:underline">View tasks</Link>
            </div>
          </div>
        ))}
      </div>

      {archived.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-3">Archived</h2>
          <div className="space-y-1">
            {archived.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-4 py-2 rounded-lg text-[var(--text-muted)] text-sm opacity-60">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color ?? "#475569" }} />
                {p.name}
                <span className="ml-auto text-xs">{p.taskCount} tasks</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}