"use client";
import { useState } from "react";

interface Task {
  id: string; title: string; notes: string | null; priority: string; status: string;
  dueDate: string | null; projectId: string | null; recurrence: string | null; createdAt: string;
}
interface Project { id: string; name: string; color: string | null; }

const priorityColors: Record<string, string> = {
  HIGH: "text-red-400 bg-red-400/10",
  MEDIUM: "text-amber-400 bg-amber-400/10",
  LOW: "text-slate-500 bg-slate-500/10",
};

export default function TasksClient({ initialTasks, projects }: { initialTasks: Task[]; projects: Project[] }) {
  const [tasks, setTasks] = useState(initialTasks);
  const [filter, setFilter] = useState<string>("active");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", notes: "", priority: "MEDIUM", dueDate: "", projectId: "", recurrence: "" });
  const [saving, setSaving] = useState(false);

  const filtered = tasks.filter((t) => {
    if (filter === "active") return t.status === "TODO" || t.status === "IN_PROGRESS";
    if (filter === "done") return t.status === "DONE";
    return true;
  });

  async function submitTask(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: form.title, notes: form.notes || null, priority: form.priority, dueDate: form.dueDate || null, projectId: form.projectId || null, recurrence: form.recurrence || null }),
    });
    if (res.ok) {
      const t = await res.json();
      setTasks((prev) => [{ ...t, dueDate: t.dueDate ?? null }, ...prev]);
      setForm({ title: "", notes: "", priority: "MEDIUM", dueDate: "", projectId: "", recurrence: "" });
      setShowForm(false);
    }
    setSaving(false);
  }

  async function updateStatus(id: string, status: string) {
    setTasks((prev) => prev.map((t) => t.id === id ? { ...t, status } : t));
    await fetch(`/api/tasks/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
  }

  async function deleteTask(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
  }

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Tasks</h1>
        <button onClick={() => setShowForm(!showForm)} className="px-4 py-2 bg-[var(--accent)] text-white text-sm rounded-lg hover:opacity-90">+ New task</button>
      </div>

      {showForm && (
        <form onSubmit={submitTask} className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl p-5 space-y-3">
          <input autoFocus value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Task title"
            className="w-full bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]" />
          <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Notes (optional)" rows={2}
            className="w-full bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] resize-none" />
          <div className="flex gap-3 flex-wrap">
            <select value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
              className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--accent)]">
              <option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option>
            </select>
            <input type="date" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
              className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--accent)]" />
            {projects.length > 0 && (
              <select value={form.projectId} onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value }))}
                className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--accent)]">
                <option value="">No project</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
            <select value={form.recurrence} onChange={(e) => setForm((f) => ({ ...f, recurrence: e.target.value }))}
              className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--accent)]">
              <option value="">One-time</option><option value="daily">Daily</option>
              <option value="weekly:1,3,5">Mon/Wed/Fri</option><option value="weekly:1,2,3,4,5">Weekdays</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="px-4 py-2 bg-[var(--accent)] text-white text-sm rounded-lg disabled:opacity-40">{saving ? "Saving..." : "Add task"}</button>
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-[var(--text-secondary)] text-sm hover:text-white">Cancel</button>
          </div>
        </form>
      )}

      <div className="flex gap-1 border-b border-[var(--border)]">
        {[["active","Active"],["done","Done"],["all","All"]].map(([v,l]) => (
          <button key={v} onClick={() => setFilter(v)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${filter === v ? "border-[var(--accent)] text-white" : "border-transparent text-[var(--text-muted)] hover:text-white"}`}>{l}</button>
        ))}
      </div>

      <div className="space-y-1">
        {filtered.length === 0 && <div className="text-center py-16 text-[var(--text-muted)]">{filter === "active" ? "No active tasks. Add one above." : "Nothing here."}</div>}
        {filtered.map((task) => (
          <div key={task.id} className={`flex items-start gap-3 px-4 py-3 rounded-xl border transition-colors group ${task.status === "DONE" ? "border-transparent opacity-50" : "bg-[var(--bg-elevated)] border-[var(--border)] hover:border-[var(--accent)]/40"}`}>
            <button onClick={() => updateStatus(task.id, task.status === "DONE" ? "TODO" : "DONE")}
              className={`mt-0.5 w-4 h-4 rounded border shrink-0 flex items-center justify-center text-xs transition-colors ${task.status === "DONE" ? "bg-[var(--accent)] border-[var(--accent)] text-white" : "border-[var(--text-muted)] hover:border-[var(--accent)]"}`}>
              {task.status === "DONE" && "✓"}
            </button>
            <div className="flex-1 min-w-0">
              <p className={`text-sm ${task.status === "DONE" ? "line-through text-[var(--text-muted)]" : "text-white"}`}>{task.title}</p>
              {task.notes && <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate">{task.notes}</p>}
              {task.dueDate && <span className="text-xs text-[var(--text-muted)]">{new Date(task.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>}
            </div>
            <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${priorityColors[task.priority]}`}>{task.priority}</span>
            <button onClick={() => deleteTask(task.id)} className="opacity-0 group-hover:opacity-100 text-[var(--text-muted)] hover:text-red-400 text-sm transition-all">&times;</button>
          </div>
        ))}
      </div>
    </div>
  );
}