"use client";
import { useState } from "react";

interface Note { id: string; title: string | null; content: string; tags: string[]; isPinned: boolean; createdAt: string; updatedAt: string; }

export default function NotesClient({ initialNotes }: { initialNotes: Note[] }) {
  const [notes, setNotes] = useState(initialNotes);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", content: "", tags: "" });
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Note | null>(null);

  const filtered = notes.filter((n) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (n.title ?? "").toLowerCase().includes(q) || n.content.toLowerCase().includes(q) || n.tags.some((t) => t.includes(q));
  });

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!form.content.trim()) return;
    setSaving(true);
    const res = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: form.title || null, content: form.content, tags: form.tags ? form.tags.split(",").map((t) => t.trim()).filter(Boolean) : [] }),
    });
    if (res.ok) {
      const n = await res.json();
      setNotes((prev) => [{ ...n }, ...prev]);
      setForm({ title: "", content: "", tags: "" });
      setShowForm(false);
    }
    setSaving(false);
  }

  async function deleteNote(id: string) {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    if (selected?.id === id) setSelected(null);
    await fetch(`/api/notes/${id}`, { method: "DELETE" });
  }

  async function togglePin(note: Note) {
    setNotes((prev) => prev.map((n) => n.id === note.id ? { ...n, isPinned: !note.isPinned } : n));
    await fetch(`/api/notes/${note.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isPinned: !note.isPinned }) });
  }

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div className="w-72 shrink-0 border-r border-[var(--border)] flex flex-col">
        <div className="p-4 space-y-3 border-b border-[var(--border)]">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold text-white">Notes</h1>
            <button onClick={() => setShowForm(!showForm)} className="text-[var(--accent)] text-lg font-bold hover:opacity-80">+</button>
          </div>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..."
            className="w-full bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-white placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]" />
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-[var(--border)]">
          {filtered.length === 0 && <p className="text-center text-[var(--text-muted)] text-sm py-8">{search ? "No matches" : "No notes yet"}</p>}
          {filtered.map((note) => (
            <button key={note.id} onClick={() => setSelected(note)}
              className={`w-full text-left px-4 py-3 hover:bg-[var(--bg-elevated)] transition-colors ${selected?.id === note.id ? "bg-[var(--bg-elevated)] border-l-2 border-[var(--accent)]" : ""}`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-white truncate">{note.title ?? note.content.slice(0, 40)}</p>
                {note.isPinned && <span className="text-amber-400 text-xs shrink-0">📌</span>}
              </div>
              <p className="text-xs text-[var(--text-muted)] mt-0.5 line-clamp-2">{note.title ? note.content.slice(0, 60) : ""}</p>
              <p className="text-xs text-[var(--text-muted)] mt-1">{new Date(note.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 overflow-y-auto p-8">
        {showForm ? (
          <form onSubmit={addNote} className="max-w-2xl space-y-3">
            <h2 className="text-lg font-bold text-white mb-4">New note</h2>
            <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Title (optional)"
              className="w-full bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]" />
            <textarea autoFocus value={form.content} onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))} placeholder="Write something..."
              rows={10}
              className="w-full bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] resize-none" />
            <input value={form.tags} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} placeholder="Tags (comma-separated)"
              className="w-full bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]" />
            <div className="flex gap-2">
              <button type="submit" disabled={saving} className="px-4 py-2 bg-[var(--accent)] text-white text-sm rounded-lg disabled:opacity-40">{saving ? "Saving..." : "Save"}</button>
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-[var(--text-secondary)] text-sm hover:text-white">Cancel</button>
            </div>
          </form>
        ) : selected ? (
          <div className="max-w-2xl space-y-4">
            <div className="flex items-start justify-between">
              <div>
                {selected.title && <h2 className="text-xl font-bold text-white">{selected.title}</h2>}
                <p className="text-xs text-[var(--text-muted)]">{new Date(selected.createdAt).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => togglePin(selected)} className={`text-sm px-2 py-1 rounded ${selected.isPinned ? "text-amber-400" : "text-[var(--text-muted)] hover:text-amber-400"}`}>📌</button>
                <button onClick={() => deleteNote(selected.id)} className="text-[var(--text-muted)] hover:text-red-400 text-sm px-2 py-1">Delete</button>
              </div>
            </div>
            <p className="text-[var(--text-primary)] whitespace-pre-wrap leading-relaxed">{selected.content}</p>
            {selected.tags.length > 0 && (
              <div className="flex gap-2 flex-wrap pt-2 border-t border-[var(--border)]">
                {selected.tags.map((t) => <span key={t} className="text-xs text-[var(--accent)] bg-[var(--accent)]/10 px-2 py-0.5 rounded-full">{t}</span>)}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-[var(--text-muted)]">
            <p className="text-4xl mb-4">≡</p>
            <p className="text-sm">Select a note or create a new one</p>
          </div>
        )}
      </div>
    </div>
  );
}