/**
 * Server-side file text extraction with intelligent formatting.
 *
 * - DOCX/DOC: full rich markdown (headings, bold, italic, tables, lists)
 * - PDF: full text extraction + inferFormatting() to reconstruct structure
 * - Plain text/log: inferFormatting() to detect and add structure
 * - Markdown: preserved as-is
 * - CSV/XLSX: formatted as markdown tables
 * - JSON: pretty-printed in a code block
 *
 * NO truncation — chunkDocument() handles size splitting downstream.
 */

import { inferFormatting } from "./inferFormatting";

export interface ParsedFile {
  filename: string;
  text: string;
  suggestedChunks: number;
}

/** Normalize line endings and collapse excess blank lines */
function clean(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Strip HTML tags from a string */
function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "").trim();
}

/**
 * Convert mammoth HTML output to rich markdown.
 * Handles: headings, bold, italic, underline, lists, tables, links, code, hr.
 */
function htmlToMarkdown(html: string): string {
  return html
    // Headings
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, (_, t) => `\n# ${stripTags(t)}\n`)
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, (_, t) => `\n## ${stripTags(t)}\n`)
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, (_, t) => `\n### ${stripTags(t)}\n`)
    .replace(/<h4[^>]*>(.*?)<\/h4>/gi, (_, t) => `\n#### ${stripTags(t)}\n`)
    .replace(/<h5[^>]*>(.*?)<\/h5>/gi, (_, t) => `\n##### ${stripTags(t)}\n`)
    .replace(/<h6[^>]*>(.*?)<\/h6>/gi, (_, t) => `\n###### ${stripTags(t)}\n`)
    // Bold / Strong
    .replace(/<(strong|b)[^>]*>(.*?)<\/(strong|b)>/gi, (_, _t, content) => `**${stripTags(content)}**`)
    // Italic / Em
    .replace(/<(em|i)[^>]*>(.*?)<\/(em|i)>/gi, (_, _t, content) => `_${stripTags(content)}_`)
    // Underline → bold (markdown has no underline)
    .replace(/<u[^>]*>(.*?)<\/u>/gi, (_, content) => `**${stripTags(content)}**`)
    // Strikethrough
    .replace(/<s[^>]*>(.*?)<\/s>/gi, (_, content) => `~~${stripTags(content)}~~`)
    // Code
    .replace(/<code[^>]*>(.*?)<\/code>/gi, (_, content) => `\`${stripTags(content)}\``)
    .replace(/<pre[^>]*>(.*?)<\/pre>/gis, (_, content) => `\n\`\`\`\n${stripTags(content)}\n\`\`\`\n`)
    // Links
    .replace(/<a[^>]+href="([^"]*)"[^>]*>(.*?)<\/a>/gi, (_, href, text) => `[${stripTags(text)}](${href})`)
    // Tables
    .replace(/<table[^>]*>(.*?)<\/table>/gis, (_, tableContent) => {
      const rows: string[][] = [];
      const rowMatches = tableContent.match(/<tr[^>]*>(.*?)<\/tr>/gis) || [];
      for (const row of rowMatches) {
        const cells = row.match(/<t[dh][^>]*>(.*?)<\/t[dh]>/gis) || [];
        rows.push(cells.map((cell) => stripTags(cell).replace(/\n/g, " ").trim()));
      }
      if (rows.length === 0) return "";
      const header = rows[0];
      const sep = header.map(() => "---");
      const mdRows = [
        `| ${header.join(" | ")} |`,
        `| ${sep.join(" | ")} |`,
        ...rows.slice(1).map((r) => `| ${r.join(" | ")} |`),
      ];
      return `\n${mdRows.join("\n")}\n`;
    })
    // Unordered lists
    .replace(/<ul[^>]*>(.*?)<\/ul>/gis, (_, content) => `\n${content}\n`)
    .replace(/<ol[^>]*>(.*?)<\/ol>/gis, (_, content) => `\n${content}\n`)
    .replace(/<li[^>]*>(.*?)<\/li>/gi, (_, t) => `- ${stripTags(t).trim()}\n`)
    // Horizontal rule
    .replace(/<hr[^>]*\/?>/gi, "\n---\n")
    // Line breaks
    .replace(/<br\s*\/?>/gi, "\n")
    // Paragraphs
    .replace(/<p[^>]*>(.*?)<\/p>/gis, (_, t) => `\n${stripTags(t).trim()}\n`)
    // Blockquote
    .replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gis, (_, t) =>
      t.split("\n").map((l: string) => `> ${l.trim()}`).join("\n")
    )
    // Strip remaining tags
    .replace(/<[^>]+>/g, "");
}

export async function parseFile(file: File): Promise<ParsedFile> {
  const name = file.name;
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const mime = file.type;

  // --- Markdown — preserve as-is ---
  if (ext === "md" || ext === "markdown") {
    const text = clean(await file.text());
    return { filename: name, text, suggestedChunks: 1 };
  }

  // --- JSON — code block ---
  if (ext === "json" || mime === "application/json") {
    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw);
      const pretty = JSON.stringify(parsed, null, 2);
      return {
        filename: name,
        text: `\`\`\`json\n${pretty}\n\`\`\``,
        suggestedChunks: 1,
      };
    } catch {
      const raw = clean(await file.text());
      return { filename: name, text: raw, suggestedChunks: 1 };
    }
  }

  // --- Plain text / log / TSV — infer formatting ---
  if (
    mime.startsWith("text/") ||
    ["txt", "log", "tsv"].includes(ext)
  ) {
    const raw = clean(await file.text());
    const formatted = inferFormatting(raw);
    return { filename: name, text: formatted, suggestedChunks: 1 };
  }

  // --- CSV — format as markdown table ---
  if (ext === "csv" || mime === "text/csv") {
    const raw = await file.text();
    const lines = raw.split("\n").filter((l) => l.trim());
    if (lines.length === 0) return { filename: name, text: "", suggestedChunks: 1 };

    const rows = lines.map((line) =>
      line.split(",").map((cell) => cell.trim().replace(/^"|"$/g, ""))
    );
    const header = rows[0];
    const sep = header.map(() => "---");
    const mdRows = [
      `| ${header.join(" | ")} |`,
      `| ${sep.join(" | ")} |`,
      ...rows.slice(1).map((r) => `| ${r.join(" | ")} |`),
    ];
    return { filename: name, text: mdRows.join("\n"), suggestedChunks: 1 };
  }

  // --- PDF — extract text + infer formatting ---
  if (ext === "pdf" || mime === "application/pdf") {
    const buffer = await file.arrayBuffer();

    if (typeof globalThis.DOMMatrix === "undefined") {
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
    const rawText = clean(result.text ?? "");

    // Run intelligent formatting inference on flat PDF text
    const formatted = inferFormatting(rawText);
    return { filename: name, text: formatted, suggestedChunks: 1 };
  }

  // --- DOCX / DOC / RTF — rich markdown via mammoth ---
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

    const htmlResult = await mammoth.convertToHtml(
      { buffer: Buffer.from(buffer) },
      {
        styleMap: [
          "p[style-name='Heading 1'] => h1:fresh",
          "p[style-name='Heading 2'] => h2:fresh",
          "p[style-name='Heading 3'] => h3:fresh",
          "p[style-name='Heading 4'] => h4:fresh",
          "p[style-name='Heading 5'] => h5:fresh",
          "p[style-name='Heading 6'] => h6:fresh",
          "p[style-name='Title'] => h1:fresh",
          "p[style-name='Subtitle'] => h2:fresh",
          "p[style-name='Quote'] => blockquote:fresh",
          "p[style-name='Intense Quote'] => blockquote:fresh",
          "p[style-name='Code'] => pre:fresh",
        ],
      }
    );

    const markdown = htmlToMarkdown(htmlResult.value);
    return { filename: name, text: clean(markdown), suggestedChunks: 1 };
  }

  // --- XLSX / XLS — one H2 section per sheet, formatted as markdown tables ---
  if (
    ext === "xlsx" ||
    ext === "xls" ||
    mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mime === "application/vnd.ms-excel"
  ) {
    const buffer = await file.arrayBuffer();
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(Buffer.from(buffer), { type: "buffer" });

    const sections: string[] = [];
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      // Get as array of arrays for proper table formatting
      const data = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "" });
      if (data.length === 0) continue;

      const header = (data[0] as string[]).map(String);
      const sep = header.map(() => "---");
      const mdRows = [
        `| ${header.join(" | ")} |`,
        `| ${sep.join(" | ")} |`,
        ...data.slice(1).map((row) =>
          `| ${(row as string[]).map(String).join(" | ")} |`
        ),
      ];

      sections.push(`## ${sheetName}\n\n${mdRows.join("\n")}`);
    }

    return {
      filename: name,
      text: clean(sections.join("\n\n")),
      suggestedChunks: workbook.SheetNames.length,
    };
  }

  // --- PPTX ---
  if (
    ext === "pptx" ||
    mime === "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  ) {
    return {
      filename: name,
      text: `> **Note:** PowerPoint files cannot be fully parsed. Please export as PDF first, then re-import.\n\n[PPTX file: ${name}]`,
      suggestedChunks: 1,
    };
  }

  // --- Fallback ---
  return {
    filename: name,
    text: `> **Note:** Unsupported file type: \`${ext || mime}\`. Copy and paste the content manually.\n\n[File: ${name}]`,
    suggestedChunks: 1,
  };
}
