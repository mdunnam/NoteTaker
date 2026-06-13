"use client";
import { useState } from "react";

interface Habit { id: string; name: string; icon: string | null; color: string | null; description: string | null; frequency: string; completedToday: boolean; }

const COLORS = ["#7c3aed","#2563eb","#16a34a","#dc2626","#ea580c","#0891b2","#db2777","#ca8a04"];

export default function HabitsClient({ initialHabits }: { initialHabits: Habit[] }) {
  const [habits, setHabits] = useState(initialHabits);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", icon: "", color: "#7c3aed", description: "", frequency: "daily" });
  const [saving, setSaving] = useState(false);

  const completed = habits.filter((h) => h.completedToday).length;
  const total = habits.length;

  async function toggle(id: string, current: boolean) {
    setHabits((prev) => prev.map((h) => h.id === id ? { ...h, completedToday: !current } : h));
    try {
      await fetch(`/api/habits/${id}/log`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ completed: !current }) });
    } catch {
      setHabits((prev) => prev.map((h) => h.id === id ? { ...h, completedToday: current } : h));
    }
  }

  async function addHabit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    const res = await fetch("/api/habits", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    if (res.ok) {
      const h = await res.json();
      setHabits((prev) => [...prev, { ...h, completedToday: false }]);
      setForm({ name: "", icon: "", color: "#7c3aed", description: "", frequency: "daily" });
      setShowForm(false);
    }
    setSaving(false);
  }

  async function deleteHabit(id: string) {
    setHabits((prev) => prev.filter((h) => h.id !== id));
    await fetch(`/api/habits/${id}`, { method: "DELETE" });
  }

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Habits</h1>
          {total > 0 && <p className="text-sm text-[var(--text-muted)] mt-0.5">{completed}/{total} today</p>}
        </div>
        <button onClick={() => setShowForm(!showForm)} className="px-4 py-2 bg-[var(--accent)] text-white text-sm rounded-lg hover:opacity-90">+ New habit</button>
      </div>

      {total > 0 && (
        <div className="h-2 rounded-full bg-[var(--bg-elevated)] overflow-hidden">
          <div className="h-full bg-[var(--accent)] rounded-full transition-all duration-500" style={{ width: `${total > 0 ? (completed / total) * 100 : 0}%` }} />
        </div>
      )}

      {showForm && (
        <form onSubmit={addHabit} className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl p-5 space-y-3">
          <div className="flex gap-3">
            <input value={form.icon} onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))} placeholder="Emoji" maxLength={2}
              className="w-16 text-center bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--accent)]" />
            <input autoFocus value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Habit name"
              className="flex-1 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]" />
          </div>
          <div className="flex gap-2 flex-wrap">
            {COLORS.map((c) => (
              <button key={c} type="button" onClick={() => setForm((f) => ({ ...f, color: c }))}
                className={`w-6 h-6 rounded-full transition-transform hover:scale-110 ${form.color === c ? "ring-2 ring-white ring-offset-2 ring-offset-[var(--bg-elevated)]" : ""}`}
                style={{ backgroundColor: c }} />
            ))}
          </div>
          <select value={form.frequency} onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value }))}
            className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--accent)]">
            <option value="daily">Every day</option>
            <option value="weekdays">Weekdays</option>
            <option value="weekends">Weekends</option>
          </select>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="px-4 py-2 bg-[var(--accent)] text-white text-sm rounded-lg disabled:opacity-40">{saving ? "Saving..." : "Add habit"}</button>
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-[var(--text-secondary)] text-sm hover:text-white">Cancel</button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        {habits.length === 0 && (
          <div className="text-center py-16 text-[var(--text-muted)]">No habits yet. Add one to start tracking.</div>
        )}
        {habits.map((habit) => (
          <div key={habit.id} className="flex items-center gap-4 group">
            <button onClick={() => toggle(habit.id, habit.completedToday)}
              className={`flex-1 flex items-center gap-4 px-5 py-4 rounded-xl border transition-all text-left ${
                habit.completedToday
                  ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                  : "border-[var(--border)] bg-[var(--bg-elevated)] hover:border-[var(--accent)]/50"
              }`}
            >
              <span className="text-2xl w-8 text-center">{habit.icon ?? "○"}</span>
              <div className="flex-1">
                <p className="font-medium text-white">{habit.name}</p>
                {habit.description && <p className="text-xs text-[var(--text-muted)] mt-0.5">{habit.description}</p>}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--text-muted)]">{habit.frequency}</span>
                {habit.completedToday && <span className="text-[var(--accent)] font-bold">✓</span>}
              </div>
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: habit.color ?? "#7c3aed" }} />
            </button>
            <button onClick={() => deleteHabit(habit.id)} className="opacity-0 group-hover:opacity-100 text-[var(--text-muted)] hover:text-red-400 transition-all text-lg px-1">&times;</button>
          </div>
        ))}
      </div>
    </div>
  );
}