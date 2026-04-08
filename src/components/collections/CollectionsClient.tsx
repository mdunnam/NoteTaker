"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";

interface Collection {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  _count: { notes: number };
}

interface CollectionsClientProps {
  initialCollections: Collection[];
}

const COLOR_OPTIONS = ["gray", "blue", "green", "purple", "red", "yellow", "orange", "pink"];

/**
 * Client component for managing collections — create, rename, delete.
 */
export default function CollectionsClient({ initialCollections }: CollectionsClientProps) {
  const router = useRouter();
  const [collections, setCollections] = useState<Collection[]>(initialCollections);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("blue");
  const [isCreating, setIsCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);

  /**
   * Submit new collection to API.
   */
  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();

    const trimmedName = name.trim();
    if (!trimmedName) return;

    setIsCreating(true);

    try {
      const response = await fetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName, description: description.trim(), color }),
      });

      if (!response.ok) throw new Error("Failed to create collection");

      const created = await response.json() as Collection;
      setCollections((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setName("");
      setDescription("");
      setColor("blue");
      setShowForm(false);
      router.refresh();
    } catch (error) {
      console.error("Error creating collection:", error);
    } finally {
      setIsCreating(false);
    }
  };

  /**
   * Delete a collection by ID.
   */
  const handleDelete = async (id: string) => {
    if (!confirm("Delete this collection? Notes inside will not be deleted.")) return;

    try {
      const response = await fetch(`/api/collections/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Delete failed");
      setCollections((prev) => prev.filter((c) => c.id !== id));
      router.refresh();
    } catch (error) {
      console.error("Error deleting collection:", error);
    }
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-gray-600">
          {collections.length} collection{collections.length === 1 ? "" : "s"}
        </p>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          New Collection
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3"
        >
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Collection name (required)"
            required
            className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
          <div className="flex flex-wrap gap-2">
            {COLOR_OPTIONS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition-all ${color === c ? "ring-2 ring-blue-600 ring-offset-1" : ""}`}
                style={{ background: `var(--color-${c}, #94a3b8)` }}
              >
                {c}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isCreating || !name.trim()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {isCreating ? "Creating..." : "Create"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {collections.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-gray-600">
          No collections yet. Create one to start organizing notes.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {collections.map((collection) => (
            <div
              key={collection.id}
              className="flex flex-col justify-between rounded-xl border border-gray-200 bg-white p-5 shadow-sm hover:border-blue-200 transition-colors"
            >
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="h-3 w-3 rounded-full shrink-0"
                    style={{ background: collection.color || "#94a3b8" }}
                  />
                  <Link href={`/collections/${collection.id}`} className="font-semibold text-gray-900 hover:text-blue-700 hover:underline">
                    {collection.name}
                  </Link>
                </div>
                {collection.description && (
                  <p className="mt-1 text-sm text-gray-500 line-clamp-2">{collection.description}</p>
                )}
              </div>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-xs text-gray-400">{collection._count.notes} notes</span>
                <div className="flex items-center gap-2">
                  <Link href={`/collections/${collection.id}`} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100">
                    Open
                  </Link>
                  <button
                    onClick={() => handleDelete(collection.id)}
                    className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-700 transition-colors"
                    title="Delete collection"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
