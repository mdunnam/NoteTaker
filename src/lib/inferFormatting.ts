/**
 * Intelligent formatting inference for plain/unformatted text.
 *
 * When a file (PDF, plain text, etc.) has no formatting,
 * this module detects structural patterns and converts them to
 * clean markdown so chunkDocument() can work with rich structure.
 *
 * Detection rules (in order of confidence):
 * - ALL CAPS short lines → # Header
 * - Title Case short lines surrounded by blank lines → ## Header
 * - Numbered section patterns "1.", "1.1", "Section 1:" → headers
 * - Bullet characters •, -, *, ◦, › → unordered lists
 * - Numbered lists "1)", "(1)", "a." → ordered lists
 * - Indented blocks (4 spaces or tab) → code block
 * - "Key: Value" pairs (consistently) → definition list
 * - Pipe-separated rows → table
 * - Separator lines (----, ====, ****) → hr
 * - Email headers "From:", "To:", "Subject:" → bold labels
 */

interface Line {
  raw: string;
  trimmed: string;
  indent: number;
  blank: boolean;
}

function parseLine(raw: string): Line {
  const trimmed = raw.trim();
  const indent = raw.length - raw.trimStart().length;
  return { raw, trimmed, blank: trimmed === "", indent };
}

/** Is the string all uppercase (and has letters)? */
function isAllCaps(s: string): boolean {
  return s.length > 0 && s === s.toUpperCase() && /[A-Z]/.test(s);
}

/** Is the string Title Case (most words capitalized)? */
function isTitleCase(s: string): boolean {
  const words = s.split(/\s+/).filter((w) => w.length > 3);
  if (words.length < 2) return false;
  const capitalised = words.filter((w) => /^[A-Z]/.test(w));
  return capitalised.length / words.length >= 0.6;
}

/** Looks like a numbered section: "1.", "1.1.", "1.1.1", "Section 2:", "Chapter 3" */
function isNumberedSection(s: string): boolean {
  return (
    /^\d+(\.\d+)*\.?\s+[A-Z]/.test(s) ||
    /^(Section|Chapter|Part|Article|Appendix)\s+\d+/i.test(s)
  );
}

/** Looks like a heading based on: short, ends without period, not a sentence */
function looksLikeHeading(s: string, maxLen = 80): boolean {
  if (s.length > maxLen) return false;
  if (s.endsWith(".") && !s.match(/^(\d+\.|[A-Z]\.)/)) return false; // Sentences end with period
  if ((s.match(/\s/g) || []).length > 12) return false; // Too many words
  return true;
}

/** Detect bullet character at start of line */
function bulletMatch(s: string): string | null {
  const m = s.match(/^([•\-\*◦›–—])\s+/);
  return m ? m[1] : null;
}

/** Detect ordered list: "1.", "1)", "(1)", "a.", "a)" */
function orderedMatch(s: string): string | null {
  const m = s.match(/^(\d+[.)]\s+|[a-z][.)]\s+|\(\d+\)\s+)/);
  return m ? m[1] : null;
}

/** Detect "Key: Value" or "Key — Value" label pattern */
function labelMatch(s: string): { key: string; value: string } | null {
  const m = s.match(/^([A-Za-z][A-Za-z0-9 ]{1,30})[:\—–]\s+(.+)$/);
  if (m) return { key: m[1].trim(), value: m[2].trim() };
  return null;
}

/** Detect pipe-separated table row */
function isTableRow(s: string): boolean {
  return s.includes("|") && s.split("|").length >= 3;
}

/** Detect separator / horizontal rule */
function isSeparator(s: string): boolean {
  return /^[-=*_]{4,}$/.test(s.replace(/\s/g, ""));
}

/** Detect email-style headers */
const EMAIL_HEADERS = ["from", "to", "cc", "bcc", "subject", "date", "reply-to", "sent"];
function isEmailHeader(s: string): boolean {
  const lower = s.toLowerCase();
  return EMAIL_HEADERS.some((h) => lower.startsWith(`${h}:`));
}

/**
 * Convert a flat text block into structured markdown.
 */
export function inferFormatting(text: string): string {
  const rawLines = text.split("\n");
  const lines = rawLines.map(parseLine);
  const out: string[] = [];

  let i = 0;
  let inCodeBlock = false;
  let tableBuffer: string[] = [];

  const flushTable = () => {
    if (tableBuffer.length === 0) return;
    if (tableBuffer.length === 1) {
      out.push(tableBuffer[0]);
    } else {
      // Build a proper markdown table
      const rows = tableBuffer.map((r) =>
        r
          .split("|")
          .map((c) => c.trim())
          .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1 || arr.length === 1)
      );
      const colCount = Math.max(...rows.map((r) => r.length));
      const header = rows[0];
      const separator = Array(colCount).fill("---");
      out.push(`| ${header.join(" | ")} |`);
      out.push(`| ${separator.join(" | ")} |`);
      for (const row of rows.slice(1)) {
        out.push(`| ${row.join(" | ")} |`);
      }
    }
    tableBuffer = [];
    out.push("");
  };

  while (i < lines.length) {
    const line = lines[i];
    const prev = i > 0 ? lines[i - 1] : null;
    const next = i < lines.length - 1 ? lines[i + 1] : null;

    // --- Blank lines ---
    if (line.blank) {
      flushTable();
      if (inCodeBlock) {
        out.push("```");
        inCodeBlock = false;
      }
      // Collapse multiple blank lines into one
      if (out[out.length - 1] !== "") out.push("");
      i++;
      continue;
    }

    // --- Table rows ---
    if (isTableRow(line.trimmed)) {
      if (inCodeBlock) { out.push("```"); inCodeBlock = false; }
      tableBuffer.push(line.trimmed);
      i++;
      continue;
    }
    if (tableBuffer.length > 0) flushTable();

    // --- Separator / hr ---
    if (isSeparator(line.trimmed)) {
      if (inCodeBlock) { out.push("```"); inCodeBlock = false; }
      out.push("---");
      i++;
      continue;
    }

    // --- Indented code block (4 spaces or tab) ---
    if (line.indent >= 4 || line.raw.startsWith("\t")) {
      if (!inCodeBlock) {
        out.push("```");
        inCodeBlock = true;
      }
      out.push(line.raw.replace(/^\t/, "    "));
      i++;
      continue;
    }
    if (inCodeBlock) {
      out.push("```");
      inCodeBlock = false;
    }

    // --- Numbered section heading ---
    if (isNumberedSection(line.trimmed) && looksLikeHeading(line.trimmed)) {
      const depth = (line.trimmed.match(/^\d+(\.\d+)*/)?.[0].split(".").length ?? 1);
      const hashes = "#".repeat(Math.min(depth + 1, 4));
      out.push(`${hashes} ${line.trimmed}`);
      i++;
      continue;
    }

    // --- ALL CAPS heading ---
    if (
      isAllCaps(line.trimmed) &&
      looksLikeHeading(line.trimmed, 70) &&
      (line.blank === false) &&
      (prev?.blank !== false || next?.blank !== false)
    ) {
      out.push(`# ${toTitleCase(line.trimmed)}`);
      i++;
      continue;
    }

    // --- Title Case heading surrounded by blank lines ---
    if (
      isTitleCase(line.trimmed) &&
      looksLikeHeading(line.trimmed) &&
      prev?.blank !== false &&
      next?.blank !== false
    ) {
      out.push(`## ${line.trimmed}`);
      i++;
      continue;
    }

    // --- Email headers ---
    if (isEmailHeader(line.trimmed)) {
      const colonIdx = line.trimmed.indexOf(":");
      const key = line.trimmed.slice(0, colonIdx);
      const value = line.trimmed.slice(colonIdx + 1).trim();
      out.push(`**${key}:** ${value}`);
      i++;
      continue;
    }

    // --- Bullet list ---
    const bullet = bulletMatch(line.trimmed);
    if (bullet) {
      const content = line.trimmed.slice(bullet.length + 1).trim();
      const prefix = line.indent > 2 ? "  - " : "- ";
      out.push(`${prefix}${content}`);
      i++;
      continue;
    }

    // --- Ordered list ---
    const ordered = orderedMatch(line.trimmed);
    if (ordered) {
      const content = line.trimmed.slice(ordered.length).trim();
      const prefix = line.indent > 2 ? "  1. " : "1. ";
      out.push(`${prefix}${content}`);
      i++;
      continue;
    }

    // --- Key: Value label (bold key) ---
    const label = labelMatch(line.trimmed);
    if (label && !label.value.includes(":")) {
      out.push(`**${label.key}:** ${label.value}`);
      i++;
      continue;
    }

    // --- Plain paragraph ---
    out.push(line.trimmed);
    i++;
  }

  if (inCodeBlock) out.push("```");
  flushTable();

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Convert ALL CAPS string to Title Case */
function toTitleCase(s: string): string {
  const minors = new Set(["a", "an", "the", "and", "but", "or", "for", "nor", "on", "at", "to", "by", "in", "of"]);
  return s
    .toLowerCase()
    .split(" ")
    .map((word, idx) =>
      idx === 0 || !minors.has(word) ? word.charAt(0).toUpperCase() + word.slice(1) : word
    )
    .join(" ");
}
