/**
 * Universal capture bar - always visible at top
 * Allows fast note entry with paste support
 */

"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Paperclip, Send } from "lucide-react";

export default function CaptureBar() {
  const [content, setContent] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
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

    try {
      const response = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawContent: content,
          tags: tags.length > 0 ? tags : undefined,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create note");
      }

      // Clear form
      setContent("");
      setTags([]);
      setTagInput("");

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
        <div className="flex gap-3">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Type, paste, or say something... (Shift+Enter for new line)"
            className="flex-1 resize-none rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 focus:ring-offset-white min-h-14"
            rows={2}
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
            Save
          </button>
        </div>

        {/* Tags section */}
        {(tags.length > 0 || tagInput.length > 0) && (
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

        {!tagInput && tags.length === 0 && (
          <button
            type="button"
            onClick={() => setTagInput("")}
            className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-900 transition-colors"
          >
            <Paperclip className="w-4 h-4" />
            Add tags (optional)
          </button>
        )}
      </form>
    </div>
  );
}
