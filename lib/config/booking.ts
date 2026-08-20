// Business rules that are not deployment-specific. Environment-specific
// values (URLs, secrets, provider keys) live in lib/config/env.ts instead.

export const DEFAULT_HOLD_TTL_MINUTES = 10;
export const WAITLIST_OFFER_TTL_MINUTES = 15;
export const MAX_SEATS_PER_BOOKING = 8;
export const SEAT_MAP_POLL_INTERVAL_MS = 3000;
export const HOLD_COUNTDOWN_TICK_MS = 1000;

export const BOOKING_REFERENCE_PREFIX = "TB";
