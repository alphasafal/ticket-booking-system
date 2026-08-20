import { ApiError } from "./api-error";

interface Bucket {
  count: number;
  windowStart: number;
}

// Deliberately in-memory: this app runs as a single Next.js instance (no
// Redis per the project's dependency-discipline constraint). A restart
// resets limits, and this doesn't share state across multiple instances —
// acceptable for basic abuse prevention on a small deployment, documented
// as a known limitation rather than pretending it's distributed-safe.
const buckets = new Map<string, Bucket>();

// Periodically drop stale buckets so this map doesn't grow unbounded.
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart > 60_000) buckets.delete(key);
  }
}, 60_000).unref?.();

export function checkRateLimit(key: string, limit: number, windowMs: number): void {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.windowStart > windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return;
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    throw new ApiError("RATE_LIMITED", "Too many requests. Please try again shortly.");
  }
}

export function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}
