import { describe, it, expect } from "vitest";
import { priceForCategory, sumPrices, type CategoryPriceMap } from "@/lib/booking/pricing";
import { ApiError } from "@/lib/utils/api-error";

describe("pricing", () => {
  it("looks up the configured price for a category", () => {
    const prices: CategoryPriceMap = { PREMIUM: 150000, STANDARD: 80000 };
    expect(priceForCategory(prices, "PREMIUM")).toBe(150000);
    expect(priceForCategory(prices, "STANDARD")).toBe(80000);
  });

  it("throws a validation error for an unconfigured category", () => {
    const prices: CategoryPriceMap = { PREMIUM: 150000 };
    expect(() => priceForCategory(prices, "STANDARD")).toThrow(ApiError);
  });

  it("sums seat prices using integer minor units, never floating point", () => {
    expect(sumPrices([80000, 80000, 150000])).toBe(310000);
    expect(sumPrices([])).toBe(0);
    // 0.1 + 0.2 !== 0.3 in floating point; integer minor units avoid that class of bug entirely.
    expect(sumPrices([10, 20])).toBe(30);
  });
});
