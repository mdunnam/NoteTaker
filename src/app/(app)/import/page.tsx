"use client";

import { useRef, useState } from "react";
import Link from "next/link";

interface ImportResult {
  filename: string;
  noteId?: string;
  error?: string;
}

const ACCEPTED_TYPES = [
  ".txt", ".md", ".markdown", ".json", ".csv", ".tsv", ".log",
  ".pdf",
  ".docx", ".doc", ".rtf",
  ".xlsx", ".xls",
  ".pptx",
].join(",");

const TYPE_DESCRIPTIONS = [
  "TXT, MD, JSON, CSV, TSV, LOG",
  "PDF",
  "DOCX, DOC, RTF",
  "XLSX, XLS",
];

export default function ImportPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [projectHint, setProjectHint] = useState("");
  const [contextHint, setContextHint] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [results, setResults] = useState<ImportResult[] | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = (incoming: FileList | File[]) => {
    const newFiles = Array.from(incoming);
    setFiles((prev) => {
      const existing = new Set(prev.map((f) => `${f.name}::${f.size}`));
      const unique = newFiles.filter((f) => !existing.has(`${f.name}::${f.size}`));
      return [...prev, ...unique].slice(0, 50);
    });
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  };

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (files.length === 0) return;

    setIsImporting(true);
    setResults(null);

    const formData = new FormData();
    for (const file of files) {
      formData.append("files[]", file);
    }
    if (projectHint.trim()) formData.append("projectHint", projectHint.trim());
    if (contextHint.trim()) formData.append("contextHint", contextHint.trim());

    try {
      const res = await fetch("/api/import", { method: "POST", body: formData });
      const data = (await res.json()) as { imported: number; failed: number; results: ImportResult[] };
      setResults(data.results);
      if (data.imported > 0) {
        setFiles([]);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    } catch (err) {
      console.error(err);
      setResults([{ filename: "Request failed", error: "Could not reach the server. Try again." }]);
    } finally {
      setIsImporting(false);
    }
  };

  const succeeded = results?.filter((r) => r.noteId) ?? [];
  const failed = results?.filter((r) => r.error) ?? [];

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Import Files</h1>
        <p className="mt-2 text-gray-600">
          Drop any files — QNote extracts the text, creates one note per file, and organizes everything automatically in the background.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {TYPE_DESCRIPTIONS.map((t) => (
            <span key={t} className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
              {t}
            </span>
          ))}
        </div>
      </div>

      <form onSubmit={handleImport} className="space-y-5">
        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition-colors ${
            isDragging
              ? "border-blue-500 bg-blue-50"
              : "border-gray-300 bg-gray-50 hover:border-blue-400 hover:bg-gray-100"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPTED_TYPES}
            className="hidden"
            onChange={(e) => { if (e.target.files) addFiles(e.target.files); }}
          />
          <p className="text-lg font-medium text-gray-700">
            {isDragging ? "Drop files here" : "Click or drag files here"}
          </p>
          <p className="mt-1 text-sm text-gray-500">Up to 50 files, 50 MB each</p>
        </div>

        {/* File list */}
        {files.length > 0 && (
          <ul className="space-y-2 rounded-xl border border-gray-200 bg-white p-4">
            {files.map((file, i) => (
              <li key={`${file.name}::${file.size}`} className="flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium text-gray-900">{file.name}</p>
                  <p className="text-xs text-gray-500">
                    {(file.size / 1024).toFixed(0)} KB · {file.type || "unknown type"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  className="shrink-0 text-xs text-gray-400 hover:text-red-600"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Hints */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Project hint (optional)</label>
            <input
              type="text"
              value={projectHint}
              onChange={(e) => setProjectHint(e.target.value)}
              placeholder="e.g. Client Research, Q2 Planning"
              className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Context hint (optional)</label>
            <input
              type="text"
              value={contextHint}
              onChange={(e) => setContextHint(e.target.value)}
              placeholder="e.g. meeting notes, research, backlog"
              className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={isImporting || files.length === 0}
            className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isImporting
              ? `Importing ${files.length} file${files.length !== 1 ? "s" : ""}...`
              : `Import ${files.length > 0 ? `${files.length} file${files.length !== 1 ? "s" : ""}` : "files"}`}
          </button>
          <Link href="/inbox" className="text-sm font-medium text-gray-600 hover:underline">
            View Inbox
          </Link>
        </div>
      </form>

      {/* Results */}
      {results && (
        <div className="mt-8 space-y-4">
          {succeeded.length > 0 && (
            <div className="rounded-xl border border-green-200 bg-green-50 p-4">
              <p className="font-medium text-green-800">
                ✓ {succeeded.length} file{succeeded.length !== 1 ? "s" : ""} imported — organizing in background
              </p>
              <ul className="mt-2 space-y-1">
                {succeeded.map((r) => (
                  <li key={r.noteId} className="text-sm text-green-700">
                    {r.filename}{" "}
                    {r.noteId && (
                      <Link href={`/notes/${r.noteId}`} className="font-medium underline hover:text-green-900">
                        View note →
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {failed.length > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="font-medium text-red-800">
                ✗ {failed.length} file{failed.length !== 1 ? "s" : ""} failed
              </p>
              <ul className="mt-2 space-y-1">
                {failed.map((r, i) => (
                  <li key={i} className="text-sm text-red-700">
                    {r.filename}: {r.error}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
