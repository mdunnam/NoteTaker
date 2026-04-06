import { describe, expect, it } from "vitest";
import {
  buildExternalCaptureCallbackPath,
  buildExternalCaptureContent,
  getExternalCaptureSource,
  sanitizeCallbackPath,
} from "@/lib/externalCapture";

describe("external capture helpers", () => {
  it("builds capture content from title, url, and text", () => {
    expect(buildExternalCaptureContent({
      title: "Interesting article",
      url: "https://example.com/story",
      text: "Selected quote",
    })).toBe("Interesting article\n\nhttps://example.com/story\n\nSelected quote");
  });

  it("preserves capture query params in the callback path", () => {
    expect(buildExternalCaptureCallbackPath({
      title: "Interesting article",
      text: "Selected quote",
      source: "bookmarklet",
    })).toBe("/capture?title=Interesting+article&text=Selected+quote&source=bookmarklet");
  });

  it("only allows safe callback paths", () => {
    expect(sanitizeCallbackPath("/capture?text=hello")).toBe("/capture?text=hello");
    expect(sanitizeCallbackPath("https://evil.example")).toBe("/inbox");
    expect(sanitizeCallbackPath("//evil.example")).toBe("/inbox");
  });

  it("normalizes supported external capture sources", () => {
    expect(getExternalCaptureSource("bookmarklet")).toBe("bookmarklet");
    expect(getExternalCaptureSource("share-target")).toBe("share-target");
    expect(getExternalCaptureSource("desktop-hotkey")).toBe("desktop-hotkey");
    expect(getExternalCaptureSource("other")).toBeNull();
  });
});