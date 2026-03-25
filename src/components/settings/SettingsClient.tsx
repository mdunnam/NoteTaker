"use client";

import { FormEvent, useState } from "react";

interface SettingsClientProps {
  name: string | null;
  email: string;
}

/**
 * Client component for editing user profile settings.
 */
export default function SettingsClient({ name, email }: SettingsClientProps) {
  const [displayName, setDisplayName] = useState(name || "");
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");

  /**
   * Submit updated profile to the API.
   */
  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    setMessage("");

    try {
      const response = await fetch("/api/user", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: displayName }),
      });

      if (!response.ok) throw new Error("Failed to save");
      setMessage("Profile updated successfully.");
    } catch (error) {
      console.error("Error saving profile:", error);
      setMessage("Could not save changes. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-4 max-w-md">
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          disabled
          className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600 cursor-not-allowed"
        />
        <p className="mt-1 text-xs text-gray-500">Email cannot be changed.</p>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="name">
          Display Name
        </label>
        <input
          id="name"
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Your name"
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
        />
      </div>

      <button
        type="submit"
        disabled={isSaving}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {isSaving ? "Saving..." : "Save Changes"}
      </button>

      {message && (
        <p className={`text-sm ${message.includes("success") ? "text-green-700" : "text-red-700"}`}>
          {message}
        </p>
      )}
    </form>
  );
}
