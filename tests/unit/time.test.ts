import { describe, it, expect } from "vitest";
import { addMinutes } from "@/lib/utils/time";
import { DEFAULT_HOLD_TTL_MINUTES, WAITLIST_OFFER_TTL_MINUTES } from "@/lib/config/booking";

describe("addMinutes", () => {
  it("adds whole minutes as milliseconds", () => {
    const base = new Date("2026-01-01T00:00:00.000Z");
    expect(addMinutes(base, 10).toISOString()).toBe("2026-01-01T00:10:00.000Z");
  });

  it("computes the seat hold expiry consistently with the configured TTL", () => {
    const base = new Date("2026-01-01T00:00:00.000Z");
    const expiry = addMinutes(base, DEFAULT_HOLD_TTL_MINUTES);
    expect(expiry.getTime() - base.getTime()).toBe(DEFAULT_HOLD_TTL_MINUTES * 60_000);
  });

  it("computes the waitlist offer expiry consistently with the configured TTL", () => {
    const base = new Date("2026-01-01T00:00:00.000Z");
    const expiry = addMinutes(base, WAITLIST_OFFER_TTL_MINUTES);
    expect(expiry.getTime() - base.getTime()).toBe(WAITLIST_OFFER_TTL_MINUTES * 60_000);
  });

  it("handles negative minutes to compute a past timestamp", () => {
    const base = new Date("2026-01-01T00:10:00.000Z");
    expect(addMinutes(base, -10).toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });
});
