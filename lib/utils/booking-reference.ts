import { randomInt } from "crypto";
import { BOOKING_REFERENCE_PREFIX } from "@/lib/config/booking";

const REFERENCE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
const REFERENCE_LENGTH = 8;

// Human-readable, non-sequential public booking reference, e.g. "TB-7F3KQ9XR".
// Never derived from the database's sequential primary key.
export function generateBookingReference(): string {
  let suffix = "";
  for (let i = 0; i < REFERENCE_LENGTH; i++) {
    suffix += REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)];
  }
  return `${BOOKING_REFERENCE_PREFIX}-${suffix}`;
}
