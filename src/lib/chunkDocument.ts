/**
 * Smart document chunking with header-aware rules.
 *
 * Strategy (in order):
 * 1. If H1 headers exist → split by H1
 *    - If any H1 section > MAX_CHARS → try H2 within it
 *      - If any H2 section > MAX_CHARS → try H3 within it
 *        - If still > MAX_CHARS → paragraph split
 * 2. If no H1 but H2 headers → split by H2 (same cascading logic)
 * 3. If no H1/H2 but H3 headers → split by H3
 * 4. No headers at all → paragraph split
 *
 * Each chunk becomes its own note in the import pipeline.
 */

export interface DocumentChunk {
  title: string;
  content: string;
}

/** Max chars per chunk — leaves room for the "[Imported from: ...]" header */
const MAX_CHUNK_CHARS = 10_000;

/**
 * Split text on lines starting with exactly `level` hashes (e.g. "## Section").
 * Returns [] if no headers of that level are found.
 */
function splitByHeader(text: string, level: number): DocumentChunk[] {
  // Matches exactly `level` hashes followed by a space and title
  const headerRe = new RegExp(`^#{${level}}(?!#) (.+)$`, "m");
  if (!headerRe.test(text)) return [];

  const lineHeaderRe = new RegExp(`^#{${level}}(?!#) (.+)$`);
  const lines = text.split("\n");

  const sections: Array<{ title: string; lines: string[] }> = [];
  const preambleLines: string[] = [];

  for (const line of lines) {
    const match = line.match(lineHeaderRe);
    if (match) {
      sections.push({ title: match[1].trim(), lines: [] });
    } else if (sections.length > 0) {
      sections[sections.length - 1].lines.push(line);
    } else {
      preambleLines.push(line);
    }
  }

  const result: DocumentChunk[] = [];
  const preamble = preambleLines.join("\n").trim();
  if (preamble) result.push({ title: "", content: preamble });

  for (const s of sections) {
    const content = s.lines.join("\n").trim();
    if (content || s.title) {
      result.push({ title: s.title, content });
    }
  }

  return result;
}

/**
 * Split content into paragraph-based chunks as a last resort.
 */
function splitByParagraphs(title: string, content: string): DocumentChunk[] {
  if (content.length <= MAX_CHUNK_CHARS) {
    return content.trim() ? [{ title, content }] : [];
  }

  const paragraphs = content.split(/\n{2,}/);
  const chunks: DocumentChunk[] = [];
  let current = "";
  let part = 1;

  for (const para of paragraphs) {
    const next = current ? `${current}\n\n${para}` : para;
    if (next.length > MAX_CHUNK_CHARS && current.length > 0) {
      chunks.push({ title: `${title} (Part ${part})`, content: current.trim() });
      current = para;
      part++;
    } else {
      current = next;
    }
  }

  if (current.trim()) {
    chunks.push({
      title: part > 1 ? `${title} (Part ${part})` : title,
      content: current.trim(),
    });
  }

  return chunks;
}

/**
 * Recursively chunk a section, trying deeper header levels before
 * falling back to paragraph splitting.
 */
function chunkSection(
  title: string,
  content: string,
  nextLevel: number
): DocumentChunk[] {
  if (!content.trim()) return [];

  if (content.length <= MAX_CHUNK_CHARS) {
    return [{ title, content }];
  }

  // Try the next header level down
  if (nextLevel <= 3) {
    const subSections = splitByHeader(content, nextLevel);
    if (subSections.length > 1) {
      const chunks: DocumentChunk[] = [];
      for (const sub of subSections) {
        const subTitle = sub.title
          ? title
            ? `${title} › ${sub.title}`
            : sub.title
          : title;
        chunks.push(...chunkSection(subTitle, sub.content, nextLevel + 1));
      }
      return chunks;
    }
    // No headers at this level — try the next
    return chunkSection(title, content, nextLevel + 1);
  }

  // No more header levels — paragraph split
  return splitByParagraphs(title, content);
}

/**
 * Add "(N of Total)" labels when there are multiple chunks.
 * Single-chunk docs get no label.
 */
function labelIfMultiple(
  chunks: DocumentChunk[],
  baseFilename: string
): DocumentChunk[] {
  const total = chunks.length;
  if (total <= 1) return chunks;

  return chunks.map((chunk, i) => ({
    ...chunk,
    title: chunk.title
      ? `${chunk.title} (${i + 1} of ${total})`
      : `${baseFilename} — Part ${i + 1} of ${total}`,
  }));
}

/**
 * Main entry point.
 * Takes the full extracted text of a document and returns an array of
 * semantically-bounded chunks ready to become individual notes.
 */
export function chunkDocument(text: string, filename: string): DocumentChunk[] {
  const baseName = filename.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");

  // Single chunk — no splitting needed
  if (text.length <= MAX_CHUNK_CHARS) {
    return [{ title: baseName, content: text }];
  }

  // Try top-level splits: H1 → H2 → H3
  for (let level = 1; level <= 3; level++) {
    const sections = splitByHeader(text, level);
    if (sections.length > 1) {
      const chunks: DocumentChunk[] = [];
      for (const section of sections) {
        const title = section.title || baseName;
        chunks.push(...chunkSection(title, section.content, level + 1));
      }
      return labelIfMultiple(chunks, baseName);
    }
  }

  // No headers found anywhere — paragraph split
  return labelIfMultiple(splitByParagraphs(baseName, text), baseName);
}
