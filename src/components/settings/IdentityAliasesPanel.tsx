"use client";

import { useState, useEffect } from "react";

export default function IdentityAliasesPanel() {
  const [aliases, setAliases] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    fetch("/api/user/identity")
      .then((r) => r.json())
      .then((d) => setAliases(d.identityAliases ?? []));
  }, []);

  function addAlias() {
    const val = input.trim();
    if (!val || aliases.includes(val)) { setInput(""); return; }
    setAliases((prev) => [...prev, val]);
    setInput("");
  }

  function removeAlias(name: string) {
    setAliases((prev) => prev.filter((a) => a !== name));
  }

  async function save() {
    setSaving(true);
    setStatus("");
    try {
      await fetch("/api/user/identity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identityAliases: aliases }),
      });
      setStatus("Saved.");
    } catch {
      setStatus("Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-800">Your Names &amp; Aliases</h3>
        <p className="mt-1 text-xs text-gray-500">
          Tell QNote which names refer to <strong>you</strong>. The AI will never treat these as other people in open loops, interview preps, or any briefing.
        </p>
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addAlias()}
          placeholder="e.g. Michael, Mike, M. Dunnam"
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
        <button
          onClick={addAlias}
          className="rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
        >
          Add
        </button>
      </div>

      {aliases.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {aliases.map((alias) => (
            <span
              key={alias}
              className="flex items-center gap-1.5 rounded-full bg-blue-50 border border-blue-200 px-3 py-1 text-sm text-blue-800"
            >
              {alias}
              <button
                onClick={() => removeAlias(alias)}
                className="text-blue-400 hover:text-blue-700 leading-none"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {status && <span className="text-xs text-gray-500">{status}</span>}
      </div>
    </div>
  );
}
