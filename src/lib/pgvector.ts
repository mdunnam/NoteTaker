/**
 * Convert an embedding array into the pgvector text literal format.
 */
export function toPgVectorLiteral(values: number[]): string {
  return `[${values.map((value) => Number(value).toFixed(8)).join(",")}]`;
}

/**
 * Parse a pgvector text literal such as "[0.1,0.2,0.3]" into a number array.
 */
export function parsePgVectorLiteral(value: string | null | undefined): number[] {
  if (!value) {
    return [];
  }

  const normalized = value.trim();
  if (!normalized.startsWith("[") || !normalized.endsWith("]")) {
    return [];
  }

  const body = normalized.slice(1, -1).trim();
  if (!body) {
    return [];
  }

  return body
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((part) => Number.isFinite(part));
}
