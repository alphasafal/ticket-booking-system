import { randomBytes } from "crypto";

// Cryptographically strong, unguessable token — never derived from
// userId/seatId/timestamp, which would be predictable.
export function generateHoldToken(): string {
  return randomBytes(32).toString("base64url");
}
