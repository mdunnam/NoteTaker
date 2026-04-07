/**
 * Universal capture bar - always visible at top
 * Allows fast note entry with paste support
 */

"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
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
    <div className="border-b border-gray-200 bg-white px-6 py-3">
      <form onSubmit={handleCapture}>
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Dump anything here — a thought, a task, a meeting note. AI will sort it out. (Ctrl+Enter to save)"
              className="w-full resize-none rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-600 min-h-[42px]"
              rows={dumpMode ? 4 : 1}
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.ctrlKey) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
            />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <label className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-2 py-2 text-[11px] text-gray-500 cursor-pointer hover:bg-gray-50">
              <input
                type="checkbox"
                checked={dumpMode}
                onChange={(e) => setDumpMode(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600"
              />
              Dump
            </label>

            <button
              type="button"
              onClick={() => setIsDumpModalOpen(true)}
              className="rounded-md border border-gray-200 px-2.5 py-2 text-xs text-gray-600 hover:bg-gray-50"
              title="Analyze a large dump of text"
            >
              Analyze
            </button>

            <button
              type="submit"
              disabled={isLoading || !content.trim()}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5 text-sm font-medium"
            >
              <Send className="w-3.5 h-3.5" />
              Save
            </button>
          </div>
        </div>

        {lastResultMessage && (
          <p className="text-xs text-green-700 mt-1.5" role="status">
            ✓ {lastResultMessage}
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
