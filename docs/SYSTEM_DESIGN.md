# System Design

This document covers the four mechanisms the assignment weights most heavily: seat holds and TTL, concurrency prevention, waitlist auto-assignment, and time-limited offers. (~700 words)

## Seat hold and TTL

Every physical `Seat` gets one `EventSeat` row per `Event` — the actual inventory unit. It carries `status` (`AVAILABLE` / `HELD` / `BOOKED`), and for holds: `holdToken`, `holdUserId`, `holdExpiresAt`.

When a customer requests a hold, the server locks the targeted `EventSeat` rows, verifies each is `AVAILABLE` (or `HELD` with `holdExpiresAt` in the past), and if all are free, sets them to `HELD` with a fresh cryptographically random token and `holdExpiresAt = now + 10 minutes` (configurable via `DEFAULT_HOLD_TTL_MINUTES`).

Critically, `holdExpiresAt` is the *only* source of truth for expiry. Nothing depends on a background job running. Every code path that reads or mutates seat state — a new hold request, checkout, the seat-map API — treats a `HELD` row with `holdExpiresAt <= now()` as effectively `AVAILABLE`, right there in the same query. A lightweight reconciliation pass (`reconcileExpiredHolds`, invoked on every seat-map read) opportunistically flips such rows back to `AVAILABLE` in bulk as a housekeeping optimization, but correctness never depends on it having run recently. If it hasn't, the very next hold or checkout attempt still gets the right answer because it re-checks expiry itself, inside its own lock.

## Concurrency prevention

The seat-hold and checkout operations are the parts of this system where correctness is non-negotiable: two people must never both win the same seat.

Both run inside a single Postgres transaction that opens with `SELECT ... FOR UPDATE` on the exact `EventSeat` rows involved, ordered deterministically (by `seatId` for holds, by row `id` for a hold's checkout) so that two overlapping multi-seat requests always acquire row locks in the same relative order and can't deadlock. Availability is checked *after* the lock is held, not before — so there is no read-then-write gap for another transaction to slip into. If any requested seat isn't available, the whole transaction throws and rolls back: partial holds never happen (A1 available + A2 taken → neither gets held).

Under a burst of concurrent requests for one seat, every request but one queues on that row's lock; each is served in turn, sees the current (possibly just-updated) row, and either wins or is correctly told `SEAT_UNAVAILABLE`. A concurrency test drives 20 simultaneous hold requests at a single seat and asserts exactly one success — this is the load-bearing test in the suite (`tests/concurrency/seat-hold.concurrency.test.ts`).

Booking confirmation (`checkout`) is idempotent: the client supplies an `idempotencyKey`, unique on `Booking`. A retried request returns the original booking rather than creating a second one, both via a fast pre-check and by catching the unique-constraint violation if two retries race each other.

## Waitlist auto-assignment

Waitlists are scoped to `(event, category)` and ordered strictly by `createdAt` — FIFO, never random.

Cancellation is where the handoff happens, and it's deliberately done *inside* the cancellation's own transaction rather than as a follow-up step: the booking flips to `CANCELLED`, and for each released seat, the earliest `WAITING` entry for that seat's category is locked and found (or not) in the same transaction before anything commits. If a candidate exists, the seat goes `HELD` again (an "offer" hold — no `holdUserId`/`holdToken`, so it's distinguishable from a customer hold) with `offerExpiresAt` set, and the waitlist entry becomes `OFFERED`. If no one is waiting, the seat is released straight to `AVAILABLE`. Because this all happens before commit, the seat is never visible as generally bookable while a FIFO candidate could still claim it.

## Time-limited offers

An offer's `offerExpiresAt` (15 minutes by default) is enforced the same way holds are: lazily, on read, with no dependency on a scheduler. `expireAndAdvanceOffer` locks the `WaitlistEntry`, confirms it's still `OFFERED` and actually expired, marks it `EXPIRED`, and — in the *same* transaction — looks for the next `WAITING` candidate to chain the seat to (or releases it if the queue is empty). Two concurrent attempts to consume the same offer (one accepting, one expiring) serialize on that row lock; whichever commits first wins, and the second sees a status that's no longer `OFFERED` and correctly fails. A guard before reclaiming the seat also checks it's still in the exact state the offer left it — if a customer hold has since taken it over via the seat map's own lazy-expiry check, the expiry still marks the entry `EXPIRED` but leaves the seat alone.
