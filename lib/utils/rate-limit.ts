import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { ApiError } from "./api-error";

// Roughly one in this many calls also sweeps away counters whose window has
// long passed, so the table stays small without needing a scheduled job.
const CLEANUP_SAMPLE_RATE = 50;

/**
 * Fixed-window rate limit, enforced in Postgres so it holds across serverless
 * instances (an in-process counter would reset on every cold start and never
 * be shared between concurrent lambdas).
 *
 * The increment-or-reset is a single atomic INSERT ... ON CONFLICT statement,
 * so two simultaneous requests can't both read a stale count and slip past
 * the limit.
 */
export async function checkRateLimit(key: string, limit: number, windowMs: number): Promise<void> {
  const now = new Date();
  const windowCutoff = new Date(now.getTime() - windowMs);

  const rows = await prisma.$queryRaw<{ count: number }[]>(Prisma.sql`
    INSERT INTO "RateLimit" ("key", "count", "windowStart")
    VALUES (${key}, 1, ${now})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE
        WHEN "RateLimit"."windowStart" <= ${windowCutoff} THEN 1
        ELSE "RateLimit"."count" + 1
      END,
      "windowStart" = CASE
        WHEN "RateLimit"."windowStart" <= ${windowCutoff} THEN ${now}
        ELSE "RateLimit"."windowStart"
      END
    RETURNING "count"
  `);

  if (Math.random() < 1 / CLEANUP_SAMPLE_RATE) {
    // Best-effort housekeeping; never block or fail the request for it.
    prisma.rateLimit
      .deleteMany({ where: { windowStart: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } } })
      .catch(() => undefined);
  }

  if ((rows[0]?.count ?? 0) > limit) {
    throw new ApiError("RATE_LIMITED", "Too many requests. Please try again shortly.");
  }
}

export function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}
