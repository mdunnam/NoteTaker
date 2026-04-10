/**
 * Server-side file text extraction.
 * Handles PDF, DOCX, RTF, XLSX, CSV, TXT, MD, JSON and plain text types.
 * Returns extracted plain text — NO truncation here.
 * The chunkDocument() pipeline downstream handles splitting large content.
 */

export interface ParsedFile {
  filename: string;
  text: string;
  /** How many notes to split into — 1 for most files, more for spreadsheets with many rows */
  suggestedChunks: number;
}

/** Strip excessive blank lines and normalize line endings */
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
    return { filename: name, text, suggestedChunks: 1 };
  }

  // --- CSV ---
  if (ext === "csv" || mime === "text/csv") {
    const raw = clean(await file.text());
    return { filename: name, text: raw, suggestedChunks: 1 };
  }

  // --- PDF ---
  if (ext === "pdf" || mime === "application/pdf") {
    const buffer = await file.arrayBuffer();
    // pdfjs-dist (used by pdf-parse) requires DOMMatrix which isn't available in Node/serverless.
    // Polyfill it before importing so the parse doesn't crash.
    if (typeof globalThis.DOMMatrix === "undefined") {
      // Minimal stub — pdfjs only uses it for affine transforms during text extraction
      // @ts-expect-error polyfill
      globalThis.DOMMatrix = class DOMMatrix {
        a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
        m11 = 1; m12 = 0; m13 = 0; m14 = 0;
        m21 = 0; m22 = 1; m23 = 0; m24 = 0;
        m31 = 0; m32 = 0; m33 = 1; m34 = 0;
        m41 = 0; m42 = 0; m43 = 0; m44 = 1;
        is2D = true; isIdentity = true;
        constructor(_init?: string | number[]) {}
        multiply() { return this; }
        translate() { return this; }
        scale() { return this; }
        rotate() { return this; }
        rotateAxisAngle() { return this; }
        skewX() { return this; }
        skewY() { return this; }
        flipX() { return this; }
        flipY() { return this; }
        inverse() { return this; }
        transformPoint(p: { x?: number; y?: number }) { return { x: p.x ?? 0, y: p.y ?? 0, z: 0, w: 1 }; }
        toFloat32Array() { return new Float32Array(16); }
        toFloat64Array() { return new Float64Array(16); }
        toString() { return "matrix(1,0,0,1,0,0)"; }
      };
    }
    const pdfParseModule = await import("pdf-parse");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfParse = (pdfParseModule as any).default ?? pdfParseModule;
    const result = await pdfParse(Buffer.from(buffer));
    const text = clean(result.text ?? "");
    return { filename: name, text, suggestedChunks: 1 };
  }

  // --- DOCX / DOC / RTF ---
  // Use convertToHtml so we can preserve heading structure as markdown headers
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

    // Convert to HTML with heading styles mapped to markdown-style headers
    const htmlResult = await mammoth.convertToHtml(
      { buffer: Buffer.from(buffer) },
      {
        styleMap: [
          "p[style-name='Heading 1'] => h1:fresh",
          "p[style-name='Heading 2'] => h2:fresh",
          "p[style-name='Heading 3'] => h3:fresh",
          "p[style-name='Heading 4'] => h4:fresh",
          "p[style-name='Title'] => h1:fresh",
          "p[style-name='Subtitle'] => h2:fresh",
        ],
      }
    );

    // Convert HTML headings to markdown headers for chunkDocument() to detect
    const markdown = htmlResult.value
      .replace(/<h1[^>]*>(.*?)<\/h1>/gi, (_, t) => `\n# ${stripTags(t)}\n`)
      .replace(/<h2[^>]*>(.*?)<\/h2>/gi, (_, t) => `\n## ${stripTags(t)}\n`)
      .replace(/<h3[^>]*>(.*?)<\/h3>/gi, (_, t) => `\n### ${stripTags(t)}\n`)
      .replace(/<h4[^>]*>(.*?)<\/h4>/gi, (_, t) => `\n#### ${stripTags(t)}\n`)
      .replace(/<li[^>]*>(.*?)<\/li>/gi, (_, t) => `- ${stripTags(t)}\n`)
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<p[^>]*>(.*?)<\/p>/gi, (_, t) => `${stripTags(t)}\n\n`)
      .replace(/<[^>]+>/g, "");

    return { filename: name, text: clean(markdown), suggestedChunks: 1 };
  }

  // --- XLSX / XLS ---
  // Each sheet becomes its own H2 section so chunkDocument() can split by sheet
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
        // Use H2 so chunkDocument() will split by sheet automatically
        sheets.push(`## ${sheetName}\n\n${csv.trim()}`);
      }
    }

    const text = clean(sheets.join("\n\n"));
    return { filename: name, text, suggestedChunks: workbook.SheetNames.length };
  }

  // --- PPTX ---
  if (
    ext === "pptx" ||
    mime === "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  ) {
    return {
      filename: name,
      text: `[PPTX file: ${name}]\nPowerPoint files cannot be fully parsed. Please export as PDF first, then re-import.`,
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

/** Strip HTML tags from a string */
function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "").trim();
}
