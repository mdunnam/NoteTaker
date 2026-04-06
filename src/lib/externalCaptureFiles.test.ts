import { describe, expect, it } from "vitest";
import {
  buildCaptureFileKey,
  formatCaptureFileSummary,
  formatImageOcrSection,
  inferCaptureFileKind,
} from "@/lib/externalCaptureFiles";

describe("external capture file helpers", () => {
  it("builds a stable file key", () => {
    expect(buildCaptureFileKey({ name: "clip.png", size: 2048, type: "image/png" })).toBe("clip.png::2048::image/png");
  });

  it("infers file kinds from mime type and extension", () => {
    expect(inferCaptureFileKind({ name: "clip.png", type: "image/png" })).toBe("image");
    expect(inferCaptureFileKind({ name: "meeting-notes.md", type: "" })).toBe("text");
    expect(inferCaptureFileKind({ name: "archive.zip", type: "application/zip" })).toBe("other");
  });

  it("formats compact summaries for capture content", () => {
    expect(formatCaptureFileSummary({ name: "clip.png", type: "image/png", size: 2048, kind: "image", width: 800, height: 600 })).toBe(
      "[Attached image: clip.png, 800x600]"
    );
    expect(formatCaptureFileSummary({ name: "notes.txt", type: "text/plain", size: 1024, kind: "text" })).toBe(
      "[Attached text file: notes.txt, 1 KB]"
    );
  });

  it("formats OCR sections only when text exists", () => {
    expect(formatImageOcrSection("clip.png", "  hello world  ")).toBe("[OCR text from image: clip.png]\nhello world");
    expect(formatImageOcrSection("clip.png", "   ")).toBe("");
  });
});