import { describe, it, expect } from "vitest";
import { generateBookingReference } from "@/lib/utils/booking-reference";

describe("generateBookingReference", () => {
  it("matches the TB-XXXXXXXX format using an unambiguous alphabet", () => {
    const reference = generateBookingReference();
    expect(reference).toMatch(/^TB-[A-HJ-NP-Z2-9]{8}$/);
  });

  it("is not a sequential/predictable identifier", () => {
    const first = generateBookingReference();
    const second = generateBookingReference();
    expect(first).not.toBe(second);
  });

  it("generates unique references across many calls", () => {
    const references = new Set(Array.from({ length: 2000 }, () => generateBookingReference()));
    expect(references.size).toBe(2000);
  });
});
