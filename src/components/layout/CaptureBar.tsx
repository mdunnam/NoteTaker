/**
 * Universal capture bar - always visible at top
 * Allows fast note entry with paste support
 */

"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Paperclip, Send } from "lucide-react";
import DumpModal from "@/components/notes/DumpModal";

export default function CaptureBar() {
  const [content, setContent] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [dumpMode, setDumpMode] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [projectHint, setProjectHint] = useState("");
  const [contextHint, setContextHint] = useState("");
  const [lastResultMessage, setLastResultMessage] = useState("");
  const [isDumpModalOpen, setIsDumpModalOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();

  /**
   * Handle capturing a new note
   */
  const handleCapture = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!content.trim()) {
      return;
    }

    setIsLoading(true);
    setLastResultMessage("");

    try {
      const response = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawContent: content,
          tags: dumpMode ? undefined : (tags.length > 0 ? tags : undefined),
          projectHint: dumpMode ? undefined : (projectHint.trim() || undefined),
          contextHint: dumpMode ? undefined : (contextHint.trim() || undefined),
          dumpMode,
          autoSplit: !dumpMode,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create note");
      }

      const data = await response.json();

      if (data?.split && typeof data?.count === "number") {
        setLastResultMessage(`Split dump into ${data.count} notes.`);
      } else {
        setLastResultMessage(dumpMode ? "Dump saved and queued for organization." : "Saved 1 note.");
      }

      // Clear form
      setContent("");
      setTags([]);
      setTagInput("");
      setProjectHint("");
      setContextHint("");

      // Focus back to textarea
      if (textareaRef.current) {
        textareaRef.current.focus();
      }

      // Optionally refresh inbox
      router.refresh();
    } catch (error) {
      console.error("Error capturing note:", error);
      alert("Failed to save note");
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Handle adding a tag
   */
  const addTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput("");
    }
  };

  /**
   * Handle removing a tag
   */
  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  return (
    <div className="border-b border-gray-200 bg-white px-6 py-4">
      <form onSubmit={handleCapture} className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-500">Capture quickly, or run a full dump analysis flow.</p>
          <div className="flex items-center gap-2">
            <label className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-2 py-1 text-[11px] text-gray-700">
              <input
                type="checkbox"
                checked={dumpMode}
                onChange={(e) => setDumpMode(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600"
              />
              Dump Mode
            </label>

            <button
              type="button"
              onClick={() => setIsDumpModalOpen(true)}
              className="rounded-md border border-blue-200 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50"
            >
              Organize This Dump
            </button>
          </div>
        </div>

        <div className="flex gap-3">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={dumpMode
              ? "Brain dump here. We'll organize it in the background..."
              : "Type, paste, or say something... (Shift+Enter for new line)"}
            className="flex-1 resize-none rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 focus:ring-offset-white min-h-14"
            rows={dumpMode ? 4 : 2}
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.ctrlKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <button
            type="submit"
            disabled={isLoading || !content.trim()}
            className="self-end px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            <Send className="w-4 h-4" />
            {dumpMode ? "Dump It" : "Save"}
          </button>
        </div>

        {!dumpMode && (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <input
              type="text"
              value={projectHint}
              onChange={(e) => setProjectHint(e.target.value)}
              placeholder="Project hint (optional): e.g. QNote, Client A"
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            <input
              type="text"
              value={contextHint}
              onChange={(e) => setContextHint(e.target.value)}
              placeholder="Context hint (optional): e.g. Sprint planning, Home admin"
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
        )}

        {!dumpMode && (tags.length > 0 || tagInput.length > 0) && (
          <div className="flex flex-wrap gap-2 items-center">
            {tags.map((tag) => (
              <div
                key={tag}
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-sm"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="hover:opacity-70"
                >
                  ×
                </button>
              </div>
            ))}

            {tagInput.length > 0 && (
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag();
                  }
                }}
                placeholder="Add tag..."
                className="px-3 py-1 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            )}
          </div>
        )}

        {!dumpMode && !tagInput && tags.length === 0 && (
          <button
            type="button"
            onClick={() => setTagInput("")}
            className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-900 transition-colors"
          >
            <Paperclip className="w-4 h-4" />
            Add tags (optional)
          </button>
        )}

        {lastResultMessage && (
          <p className="text-xs text-green-700" role="status">
            {lastResultMessage}
          </p>
        )}
      </form>

      <DumpModal
        open={isDumpModalOpen}
        onClose={() => setIsDumpModalOpen(false)}
        onCreated={(count) => {
          setLastResultMessage(`Created ${count} note${count === 1 ? "" : "s"} from dump.`);
          router.refresh();
        }}
      />
    </div>
  );
}
