/**
 * Simple in-memory rate limiter for MVP.
 * Tracks requests per user per endpoint and enforces limits.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

const LIMITS = {
  "/api/notes": { maxRequests: 20, windowMs: 60000 }, // 20 per minute
  "/api/search/ask": { maxRequests: 10, windowMs: 60000 }, // 10 per minute
  "/api/search/semantic": { maxRequests: 30, windowMs: 60000 }, // 30 per minute
};

/**
 * Check if a user has exceeded the rate limit for an endpoint.
 * Returns { ok: true } if allowed, { ok: false, retryAfter } if blocked.
 */
export function checkRateLimit(
  userId: string,
  endpoint: string
): { ok: boolean; retryAfter?: number } {
  const limit = LIMITS[endpoint as keyof typeof LIMITS];
  if (!limit) return { ok: true }; // No limit defined, allow

  const key = `${userId}:${endpoint}`;
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  // If no entry or window expired, create new entry
  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + limit.windowMs });
    return { ok: true };
  }

  // Increment and check if over limit
  if (entry.count < limit.maxRequests) {
    entry.count++;
    return { ok: true };
  }

  const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
  return { ok: false, retryAfter };
}

/**
 * Generate a unique request ID for logging and tracing.
 */
export function generateRequestId(): string {
  return `req-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Clean up old rate limit entries (run periodically in background).
 */
export function cleanupRateLimitStore() {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetAt + 60000) {
      rateLimitStore.delete(key);
    }
  }
}

// Run cleanup every 5 minutes
setInterval(cleanupRateLimitStore, 5 * 60 * 1000);
