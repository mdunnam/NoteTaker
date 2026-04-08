/**
 * Shared types for the Daily Digest feature.
 * Kept separate so client components can import types without pulling in server-side deps.
 */

export interface DigestItem {
  id: string;
  text: string;
  detail?: string;
  noteIds: string[];
  urgency: "high" | "medium" | "low";
}

export interface DigestSection {
  key: string;
  label: string;
  emoji: string;
  items: DigestItem[];
}

export interface DigestContent {
  greeting: string;
  summary: string;
  sections: DigestSection[];
  generatedAt: string;
}
