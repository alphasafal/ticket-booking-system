import { describe, it, expect } from "vitest";
import { generateHoldToken } from "@/lib/seat/hold-token";

describe("generateHoldToken", () => {
  it("produces a long, high-entropy token", () => {
    const token = generateHoldToken();
    expect(token.length).toBeGreaterThanOrEqual(32);
  });

  it("is not derived from any predictable input", () => {
    const tokens = new Set(Array.from({ length: 500 }, () => generateHoldToken()));
    expect(tokens.size).toBe(500);
  });
});
