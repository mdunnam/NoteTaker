"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

/**
 * Generate a browser bookmarklet for capturing short clips into the app.
 */
export default function CaptureFromAnywherePanel() {
  const [copyMessage, setCopyMessage] = useState("");

  const bookmarkletHref = useMemo(() => {
    if (typeof window === "undefined") {
      return "#";
    }

    const captureUrl = `${window.location.origin}/capture`;
    return `javascript:(()=>{const selection=window.getSelection?String(window.getSelection()||'').trim():'';const params=new URLSearchParams();if(document.title)params.set('title',document.title);if(location.href)params.set('url',location.href);if(selection)params.set('text',selection);params.set('source','bookmarklet');window.open('${captureUrl}?'+params.toString(),'_blank','noopener,noreferrer');})();`;
  }, []);

  /** Copy the bookmarklet code for browsers where dragging is inconvenient. */
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(bookmarkletHref);
      setCopyMessage("Bookmarklet copied.");
    } catch (error) {
      console.error("Error copying bookmarklet:", error);
      setCopyMessage("Could not copy bookmarklet.");
    }
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-gray-900">Capture From Anywhere</h3>
      <p className="mt-2 text-sm text-gray-600">
        Save short web clips from outside the app with a bookmarklet, or install QNote in a supporting browser and share text and links into the focused capture page.
      </p>
      <p className="mt-2 text-sm text-gray-600">
        The focused capture page now accepts pasted screenshots and runs OCR when possible. There is also a desktop helper foundation in this repo that can launch the same capture flow from a global hotkey.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <a
          href={bookmarkletHref}
          className="rounded-xl border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-800"
        >
          QNote Capture
        </a>
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Copy Bookmarklet
        </button>
        <Link href="/capture" className="text-sm font-medium text-blue-700 hover:underline">
          Open capture page
        </Link>
      </div>

      <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-gray-700">
        <li>Drag `QNote Capture` to your bookmarks bar, or copy the bookmarklet manually.</li>
        <li>On any page, select short text if you want to capture a snippet.</li>
        <li>Click the bookmarklet to open QNote’s focused capture page with the clip prefilled.</li>
        <li>For installed browsers that support web-app sharing, install QNote and use the system share sheet to send a title, URL, or selected text into QNote.</li>
        <li>Paste screenshots or attach images on the capture page to add OCR text when it can be extracted.</li>
      </ol>

      <p className="mt-4 text-xs text-gray-500">
        This is the browser capture foundation plus a desktop-helper scaffold. It is designed for quick capture, not full-page scraping or a fully bundled offline desktop app.
      </p>

      {copyMessage && (
        <p className={`mt-3 text-sm ${copyMessage.includes("copied") ? "text-green-700" : "text-red-700"}`}>
          {copyMessage}
        </p>
      )}
    </div>
  );
}