import { randomUUID } from "crypto";
import { describe, it, expect, afterEach } from "vitest";
import { checkRateLimit } from "@/lib/utils/rate-limit";
import { ApiError } from "@/lib/utils/api-error";
import { prisma } from "@/lib/db/prisma";

describe("checkRateLimit", () => {
  const keys: string[] = [];
  const newKey = () => {
    const key = `test-${randomUUID()}`;
    keys.push(key);
    return key;
  };

  afterEach(async () => {
    await prisma.rateLimit.deleteMany({ where: { key: { in: keys } } });
    keys.length = 0;
  });

  it("allows requests up to the limit", async () => {
    const key = newKey();
    for (let i = 0; i < 5; i++) {
      await expect(checkRateLimit(key, 5, 60_000)).resolves.toBeUndefined();
    }
  });

  it("rejects with RATE_LIMITED once the limit is exceeded", async () => {
    const key = newKey();
    for (let i = 0; i < 5; i++) await checkRateLimit(key, 5, 60_000);

    await expect(checkRateLimit(key, 5, 60_000)).rejects.toBeInstanceOf(ApiError);
    await expect(checkRateLimit(key, 5, 60_000)).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("tracks separate keys independently", async () => {
    const keyA = newKey();
    const keyB = newKey();
    for (let i = 0; i < 5; i++) await checkRateLimit(keyA, 5, 60_000);
    await expect(checkRateLimit(keyB, 5, 60_000)).resolves.toBeUndefined();
  });

  it("starts a fresh window once the previous one has elapsed", async () => {
    const key = newKey();
    for (let i = 0; i < 5; i++) await checkRateLimit(key, 5, 60_000);
    await expect(checkRateLimit(key, 5, 60_000)).rejects.toMatchObject({ code: "RATE_LIMITED" });

    // Backdate the window rather than sleeping through a real one.
    await prisma.rateLimit.update({
      where: { key },
      data: { windowStart: new Date(Date.now() - 120_000) },
    });

    await expect(checkRateLimit(key, 5, 60_000)).resolves.toBeUndefined();
  });

  it("counts concurrent requests atomically, without letting extras through", async () => {
    const key = newKey();
    const limit = 5;

    // 20 simultaneous calls against a limit of 5: exactly 5 may pass.
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => checkRateLimit(key, limit, 60_000)),
    );
    const allowed = results.filter((r) => r.status === "fulfilled");
    expect(allowed).toHaveLength(limit);
  });
});
