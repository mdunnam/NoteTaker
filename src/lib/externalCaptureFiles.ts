import type { ExternalCaptureFile, ExternalCaptureFileKind } from "@/lib/externalCapture";

export const MAX_CAPTURE_FILES = 6;
export const MAX_INLINE_TEXT_BYTES = 200_000;
export const MAX_OCR_IMAGE_BYTES = 10_000_000;

interface CaptureFileLike {
  name: string;
  type: string;
}

/** Build a stable key for file metadata tracked during external capture. */
export function buildCaptureFileKey(file: Pick<ExternalCaptureFile, "name" | "size" | "type">): string {
  return `${file.name}::${file.size}::${file.type}`;
}

/** Infer whether a file should be treated as text, image, or generic binary data. */
export function inferCaptureFileKind(file: CaptureFileLike): ExternalCaptureFileKind {
  if (file.type.startsWith("image/")) {
    return "image";
  }

  if (file.type.startsWith("text/") || /\.(txt|md|markdown|json|csv|tsv|log)$/i.test(file.name)) {
    return "text";
  }

  return "other";
}

/** Format a compact line that preserves attachment context inside note content. */
export function formatCaptureFileSummary(file: ExternalCaptureFile): string {
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

/** Format OCR output so it can be appended to the note body as reviewable text. */
export function formatImageOcrSection(fileName: string, extractedText: string): string {
  const normalizedText = extractedText.trim();

  if (!normalizedText) {
    return "";
  }

  return `[OCR text from image: ${fileName}]\n${normalizedText}`;
}