import { describe, it, expect } from "vitest";
import { checkRateLimit } from "@/lib/utils/rate-limit";
import { ApiError } from "@/lib/utils/api-error";

describe("checkRateLimit", () => {
  it("allows requests up to the limit", () => {
    const key = `test-${crypto.randomUUID()}`;
    for (let i = 0; i < 5; i++) {
      expect(() => checkRateLimit(key, 5, 60_000)).not.toThrow();
    }
  });

  it("rejects the request once the limit is exceeded", () => {
    const key = `test-${crypto.randomUUID()}`;
    for (let i = 0; i < 5; i++) checkRateLimit(key, 5, 60_000);
    expect(() => checkRateLimit(key, 5, 60_000)).toThrow(ApiError);
    try {
      checkRateLimit(key, 5, 60_000);
    } catch (error) {
      expect((error as ApiError).code).toBe("RATE_LIMITED");
    }
  });

  it("tracks separate keys independently", () => {
    const keyA = `test-${crypto.randomUUID()}`;
    const keyB = `test-${crypto.randomUUID()}`;
    for (let i = 0; i < 5; i++) checkRateLimit(keyA, 5, 60_000);
    expect(() => checkRateLimit(keyB, 5, 60_000)).not.toThrow();
  });
});
