import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

describe("/capture/share POST", () => {
  it("redirects shared form data into the capture route query shape", async () => {
    const formData = new FormData();
    formData.set("title", "Interesting article");
    formData.set("url", "https://example.com/story");
    formData.set("text", "Selected quote");

    const request = new NextRequest("http://localhost/capture/share", {
      method: "POST",
      body: formData,
    });

    const response = await POST(request);

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost/capture?title=Interesting+article&url=https%3A%2F%2Fexample.com%2Fstory&text=Selected+quote&source=share-target"
    );
  });
});