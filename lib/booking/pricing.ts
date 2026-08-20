import type { SeatCategory } from "@prisma/client";
import { ApiError } from "@/lib/utils/api-error";

export type CategoryPriceMap = Partial<Record<SeatCategory, number>>;

export function priceForCategory(prices: CategoryPriceMap, category: SeatCategory): number {
  const price = prices[category];
  if (price === undefined) {
    throw new ApiError(
      "VALIDATION_ERROR",
      `No price configured for category ${category} on this event.`,
    );
  }
  return price;
}

export function sumPrices(prices: number[]): number {
  return prices.reduce((total, price) => total + price, 0);
}
