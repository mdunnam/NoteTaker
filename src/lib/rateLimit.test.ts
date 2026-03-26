import { describe, expect, it } from "vitest";
import { checkRateLimit } from "@/lib/rateLimit";

/**
 * Tests for basic rate limit behavior.
 */
describe("checkRateLimit", () => {
  it("allows requests under the configured limit", () => {
    const userId = "user-under-limit";

    const result1 = checkRateLimit(userId, "/api/notes");
    const result2 = checkRateLimit(userId, "/api/notes");

    expect(result1.ok).toBe(true);
    expect(result2.ok).toBe(true);
  });

  it("blocks requests above limit and returns retryAfter", () => {
    const userId = "user-over-limit";

    for (let i = 0; i < 20; i++) {
      expect(checkRateLimit(userId, "/api/notes").ok).toBe(true);
    }

    const blocked = checkRateLimit(userId, "/api/notes");

    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it("allows unknown endpoints without rate limiting", () => {
    const userId = "user-no-limit";
    const result = checkRateLimit(userId, "/api/not-configured");
    expect(result.ok).toBe(true);
  });
});
