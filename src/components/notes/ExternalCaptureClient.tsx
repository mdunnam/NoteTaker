"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { ExternalCaptureFile, ExternalCaptureFileKind, ExternalCaptureSource } from "@/lib/externalCapture";

const MAX_CAPTURE_FILES = 6;
const MAX_INLINE_TEXT_BYTES = 200_000;

function buildCaptureFileKey(file: Pick<ExternalCaptureFile, "name" | "size" | "type">): string {
  return `${file.name}::${file.size}::${file.type}`;
}

function inferCaptureFileKind(file: File): ExternalCaptureFileKind {
  if (file.type.startsWith("image/")) {
    return "image";
  }

  if (file.type.startsWith("text/") || /\.(txt|md|markdown|json|csv|tsv|log)$/i.test(file.name)) {
    return "text";
  }

  return "other";
}

function formatCaptureFileSummary(file: ExternalCaptureFile): string {
  const sizeKb = Math.max(1, Math.round(file.size / 1024));

  if (file.kind === "image") {
    const dimensions = file.width && file.height ? `, ${file.width}x${file.height}` : "";
    return `[Attached image: ${file.name}${dimensions}]`;
  }

  if (file.kind === "text") {
    return `[Attached text file: ${file.name}, ${sizeKb} KB]`;
  }

  return `[Attached file: ${file.name}, ${file.type || "unknown"}, ${sizeKb} KB]`;
}

async function getImageDimensions(file: File): Promise<{ width: number | null; height: number | null }> {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      resolve({ width: image.naturalWidth || null, height: image.naturalHeight || null });
      URL.revokeObjectURL(objectUrl);
    };

    image.onerror = () => {
      resolve({ width: null, height: null });
      URL.revokeObjectURL(objectUrl);
    };

    image.src = objectUrl;
  });
}

async function prepareCaptureFile(file: File): Promise<{ metadata: ExternalCaptureFile; appendedText: string }> {
  const kind = inferCaptureFileKind(file);
  const imageDimensions = kind === "image" ? await getImageDimensions(file) : { width: null, height: null };
  const metadata: ExternalCaptureFile = {
    name: file.name,
    type: file.type || "application/octet-stream",
    size: file.size,
    kind,
    width: imageDimensions.width,
    height: imageDimensions.height,
  };

  if (kind === "text") {
    if (file.size > MAX_INLINE_TEXT_BYTES) {
      return {
        metadata,
        appendedText: `${formatCaptureFileSummary(metadata)}\nText file too large to inline safely.`,
      };
    }

    const textContent = (await file.text()).trim();
    return {
      metadata,
      appendedText: textContent
        ? `${formatCaptureFileSummary(metadata)}\n${textContent}`
        : formatCaptureFileSummary(metadata),
    };
  }

  return {
    metadata,
    appendedText: formatCaptureFileSummary(metadata),
  };
}

interface ExternalCaptureClientProps {
  initialContent: string;
  initialSourceTitle?: string;
  initialSourceUrl?: string;
  captureSource?: ExternalCaptureSource | null;
}

/**
 * Focused capture form used by the browser bookmarklet and other external entry points.
 */
export default function ExternalCaptureClient({
  initialContent,
  initialSourceTitle = "",
  initialSourceUrl = "",
  captureSource = null,
}: ExternalCaptureClientProps) {
  const [content, setContent] = useState(initialContent);
  const [projectHint, setProjectHint] = useState("");
  const [contextHint, setContextHint] = useState("");
  const [sourceTitle] = useState(initialSourceTitle);
  const [sourceUrl] = useState(initialSourceUrl);
  const [captureFiles, setCaptureFiles] = useState<ExternalCaptureFile[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [savedNoteId, setSavedNoteId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** Add selected files or pasted screenshots into the capture payload. */
  const handleSelectedFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (files.length === 0) {
      return;
    }

    const existingKeys = new Set(captureFiles.map(buildCaptureFileKey));
    const remainingSlots = Math.max(0, MAX_CAPTURE_FILES - existingKeys.size);
    const selectedFiles = files.slice(0, remainingSlots);
    const nextMetadata: ExternalCaptureFile[] = [];
    const appendedSections: string[] = [];

    for (const file of selectedFiles) {
      const key = buildCaptureFileKey({ name: file.name, size: file.size, type: file.type || "application/octet-stream" });
      if (existingKeys.has(key)) {
        continue;
      }

      existingKeys.add(key);
      const prepared = await prepareCaptureFile(file);
      nextMetadata.push(prepared.metadata);
      appendedSections.push(prepared.appendedText);
    }

    if (nextMetadata.length === 0) {
      return;
    }

    setCaptureFiles((current) => [...current, ...nextMetadata].slice(0, MAX_CAPTURE_FILES));
    setContent((current) => {
      const sections = [current.trim(), ...appendedSections.map((section) => section.trim()).filter(Boolean)].filter(Boolean);
      return sections.join("\n\n");
    });

    if (files.length > remainingSlots) {
      setMessage(`Only the first ${MAX_CAPTURE_FILES} files are kept on one capture.`);
    }
  };

  /** Remove one captured file from the metadata list. */
  const removeCaptureFile = (fileToRemove: ExternalCaptureFile) => {
    setCaptureFiles((current) => current.filter((file) => buildCaptureFileKey(file) !== buildCaptureFileKey(fileToRemove)));
  };

  /** Save one externally captured note using the existing notes API. */
  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!content.trim()) {
      return;
    }

    setIsSaving(true);
    setMessage("");
    setSavedNoteId(null);

    try {
      const response = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawContent: content,
          projectHint: projectHint.trim() || undefined,
          contextHint: contextHint.trim() || undefined,
          captureSource: captureSource || undefined,
          sourceTitle: sourceTitle || undefined,
          sourceUrl: sourceUrl || undefined,
          captureFiles: captureFiles.length > 0 ? captureFiles : undefined,
          autoSplit: false,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create note");
      }

      const payload = (await response.json()) as { note?: { id: string } };
      setMessage("Clip saved and queued for organization.");
      setSavedNoteId(payload.note?.id || null);
      setContent("");
      setProjectHint("");
      setContextHint("");
      setCaptureFiles([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      textareaRef.current?.focus();
    } catch (error) {
      console.error("Error saving external capture:", error);
      setMessage("Could not save clip. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-3xl font-bold text-gray-900">Capture From Anywhere</h1>
        <p className="mt-2 text-sm text-gray-600">
          This page is the landing zone for bookmarklet clips and quick captures from outside QNote. It works best for short selections, page titles, URLs, and quick thoughts.
        </p>

        {(sourceTitle || sourceUrl || captureSource) && (
          <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
            <p className="font-medium text-blue-900">Source metadata</p>
            {captureSource && <p className="mt-1 text-xs uppercase tracking-wide text-blue-700">{captureSource}</p>}
            {sourceTitle && <p className="mt-2">{sourceTitle}</p>}
            {sourceUrl && (
              <a href={sourceUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block break-all text-blue-700 hover:underline">
                {sourceUrl}
              </a>
            )}
          </div>
        )}

        <form onSubmit={handleSave} className="mt-6 space-y-4">
          <div>
            <label htmlFor="external-capture-content" className="mb-2 block text-sm font-medium text-gray-700">
              Captured text
            </label>
            <textarea
              id="external-capture-content"
              ref={textareaRef}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              onPaste={(event) => {
                const files = event.clipboardData?.files;
                if (files && files.length > 0) {
                  event.preventDefault();
                  void handleSelectedFiles(files);
                }
              }}
              placeholder="Paste or capture text here..."
              rows={10}
              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex cursor-pointer items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*,text/*,.md,.markdown,.txt,.json,.csv,.tsv,.log"
                  className="hidden"
                  onChange={(event) => {
                    if (event.target.files) {
                      void handleSelectedFiles(event.target.files);
                    }
                  }}
                />
                Add files or screenshots
              </label>
              <p className="text-xs text-gray-600">
                Paste a screenshot into the text box, or attach files here. Small text files are inlined for AI organization; images and binaries keep metadata.
              </p>
            </div>

            {captureFiles.length > 0 && (
              <ul className="mt-3 space-y-2">
                {captureFiles.map((file) => (
                  <li key={buildCaptureFileKey(file)} className="flex items-start justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
                    <div>
                      <p className="font-medium text-gray-900">{file.name}</p>
                      <p className="text-xs text-gray-500">
                        {file.kind}
                        {file.type ? ` · ${file.type}` : ""}
                        {file.width && file.height ? ` · ${file.width}x${file.height}` : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeCaptureFile(file)}
                      className="text-xs font-medium text-gray-500 hover:text-red-700"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label htmlFor="external-capture-project" className="mb-2 block text-sm font-medium text-gray-700">
                Project hint
              </label>
              <input
                id="external-capture-project"
                type="text"
                value={projectHint}
                onChange={(event) => setProjectHint(event.target.value)}
                placeholder="Optional: QNote, Client A, Launch"
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label htmlFor="external-capture-context" className="mb-2 block text-sm font-medium text-gray-700">
                Context hint
              </label>
              <input
                id="external-capture-context"
                type="text"
                value={contextHint}
                onChange={(event) => setContextHint(event.target.value)}
                placeholder="Optional: article research, client call, backlog cleanup"
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={isSaving || !content.trim()}
              className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {isSaving ? "Saving..." : "Save Clip"}
            </button>
            <Link href="/settings" className="text-sm font-medium text-blue-700 hover:underline">
              Back to Settings
            </Link>
            <Link href="/inbox" className="text-sm font-medium text-gray-700 hover:underline">
              Open Inbox
            </Link>
          </div>

          {message && (
            <div className={`rounded-lg border px-3 py-2 text-sm ${savedNoteId ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-800"}`}>
              <p>{message}</p>
              {savedNoteId && (
                <Link href={`/notes/${savedNoteId}`} className="mt-1 inline-block font-medium text-green-900 hover:underline">
                  Open saved note
                </Link>
              )}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}