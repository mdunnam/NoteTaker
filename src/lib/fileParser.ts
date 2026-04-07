/**
 * Server-side file text extraction.
 * Handles PDF, DOCX, RTF, XLSX, CSV, TXT, MD, JSON and plain text types.
 * Returns extracted plain text ready for AI enrichment.
 */

export interface ParsedFile {
  filename: string;
  text: string;
  /** How many notes to split into — 1 for most files, more for spreadsheets with many rows */
  suggestedChunks: number;
}

/** Max characters to send to AI per note — avoid token overflow */
const MAX_CHARS_PER_NOTE = 12_000;

/** Truncate with a notice if content is too long */
function truncate(text: string, filename: string): string {
  if (text.length <= MAX_CHARS_PER_NOTE) return text;
  return (
    text.slice(0, MAX_CHARS_PER_NOTE) +
    `\n\n[Truncated: ${filename} exceeded ${MAX_CHARS_PER_NOTE} chars. Import remaining content separately.]`
  );
}

/** Strip excessive blank lines */
function clean(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export async function parseFile(file: File): Promise<ParsedFile> {
  const name = file.name;
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const mime = file.type;

  // --- Plain text / markdown / log / JSON ---
  if (
    mime.startsWith("text/") ||
    ["txt", "md", "markdown", "log", "json", "tsv"].includes(ext)
  ) {
    const text = clean(await file.text());
    return { filename: name, text: truncate(text, name), suggestedChunks: 1 };
  }

  // --- CSV ---
  if (ext === "csv" || mime === "text/csv") {
    const raw = clean(await file.text());
    return { filename: name, text: truncate(raw, name), suggestedChunks: 1 };
  }

  // --- PDF ---
  if (ext === "pdf" || mime === "application/pdf") {
    const buffer = await file.arrayBuffer();
    // pdf-parse exports as a named export in some versions
    const pdfParseModule = await import("pdf-parse");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfParse = ((pdfParseModule.default ?? pdfParseModule) as unknown) as (buf: Buffer) => Promise<{ text: string }>;
    const result = await pdfParse(Buffer.from(buffer));
    const text = clean(result.text);
    return { filename: name, text: truncate(text, name), suggestedChunks: 1 };
  }

  // --- DOCX / DOC / RTF ---
  if (
    ext === "docx" ||
    ext === "doc" ||
    ext === "rtf" ||
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mime === "application/msword" ||
    mime === "application/rtf" ||
    mime === "text/rtf"
  ) {
    const buffer = await file.arrayBuffer();
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
    const text = clean(result.value);
    return { filename: name, text: truncate(text, name), suggestedChunks: 1 };
  }

  // --- XLSX / XLS ---
  if (
    ext === "xlsx" ||
    ext === "xls" ||
    mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mime === "application/vnd.ms-excel"
  ) {
    const buffer = await file.arrayBuffer();
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(Buffer.from(buffer), { type: "buffer" });

    const sheets: string[] = [];
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
      if (csv.trim()) {
        sheets.push(`## Sheet: ${sheetName}\n${csv.trim()}`);
      }
    }

    const text = clean(sheets.join("\n\n"));
    return { filename: name, text: truncate(text, name), suggestedChunks: 1 };
  }

  // --- PPTX ---
  if (
    ext === "pptx" ||
    mime === "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  ) {
    return {
      filename: name,
      text: `[PPTX file: ${name}]\nPowerPoint files cannot be fully parsed. Please copy and paste the slide text manually, or export as PDF first.`,
      suggestedChunks: 1,
    };
  }

  // --- Fallback for unknown types ---
  return {
    filename: name,
    text: `[Unsupported file: ${name} (${mime || ext})]\nThis file type could not be parsed. Copy and paste the content manually.`,
    suggestedChunks: 1,
  };
}
