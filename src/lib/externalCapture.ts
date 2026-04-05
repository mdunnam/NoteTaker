export interface ExternalCaptureSearchParams {
  text?: string | string[];
  title?: string | string[];
  url?: string | string[];
  source?: string | string[];
}

export type ExternalCaptureSource = "bookmarklet" | "share-target" | "manual";

function getFirstValue(value: string | string[] | null | undefined): string {
  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[0] : "";
  }

  return typeof value === "string" ? value : "";
}

/** Build the prefilled capture body from common external capture query params. */
export function buildExternalCaptureContent(searchParams: ExternalCaptureSearchParams): string {
  const parts = [
    getFirstValue(searchParams.title).trim(),
    getFirstValue(searchParams.url).trim(),
    getFirstValue(searchParams.text).trim(),
  ].filter(Boolean);

  return [...new Set(parts)].join("\n\n");
}

/** Normalize the external capture source into one of the supported values. */
export function getExternalCaptureSource(value: string | string[] | null | undefined): ExternalCaptureSource | null {
  const normalized = getFirstValue(value).trim().toLowerCase();

  if (normalized === "bookmarklet" || normalized === "share-target" || normalized === "manual") {
    return normalized;
  }

  return null;
}

/** Keep callback redirects same-origin and path-based. */
export function sanitizeCallbackPath(callbackUrl: string | string[] | null | undefined): string {
  const value = getFirstValue(callbackUrl).trim();

  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/inbox";
  }

  return value;
}

/** Build the callback path back into external capture while preserving query state. */
export function buildExternalCaptureCallbackPath(searchParams: ExternalCaptureSearchParams): string {
  const params = new URLSearchParams();
  const title = getFirstValue(searchParams.title).trim();
  const url = getFirstValue(searchParams.url).trim();
  const text = getFirstValue(searchParams.text).trim();
  const source = getExternalCaptureSource(searchParams.source);

  if (title) {
    params.set("title", title);
  }

  if (url) {
    params.set("url", url);
  }

  if (text) {
    params.set("text", text);
  }

  if (source) {
    params.set("source", source);
  }

  const query = params.toString();
  return query ? `/capture?${query}` : "/capture";
}