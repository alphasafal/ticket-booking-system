# Database Schema

PostgreSQL via Prisma. Full source of truth: [`prisma/schema.prisma`](../prisma/schema.prisma).

## Entity relationship overview

```
User ──< Event (organiserId)
User ──< Booking (userId)
User ──< WaitlistEntry (userId)

Venue ──< Seat
Venue ──< Event

Event ──< EventCategoryPrice
Event ──< EventSeat >── Seat        (EventSeat is the join: one row per Event × Seat)
Event ──< Booking
Event ──< WaitlistEntry

Booking ──< BookingSeat >── EventSeat

WaitlistEntry >── EventSeat (offeredSeatId, nullable)
```

## Why `EventSeat` exists

`Seat` is a physical seat belonging to a `Venue` — it's reused across every event held at that venue. `Event` is a scheduled showing. Availability, though, is specific to one event: seat A1 can be booked for Saturday's concert and still be free for Sunday's. `EventSeat` is that per-event inventory row — the one place `status`, `holdToken`, `holdUserId`, and `holdExpiresAt` live. It is deliberately the single row every hold, checkout, and cancellation locks and mutates; nothing about seat availability is ever computed from `Seat` directly.

A unique constraint on `(eventId, seatId)` guarantees there is never more than one inventory row for a given seat within a given event.

## Tables

**User** — `id, name, email (unique), passwordHash, role (CUSTOMER|ORGANISER|ADMIN), createdAt, updatedAt`. Passwords are bcrypt-hashed, never stored in plain text.

**Venue** — `id, name, description, createdAt, updatedAt`.

**Seat** — `id, venueId, row, number, category (PREMIUM|STANDARD)`. Unique on `(venueId, row, number)` — no duplicate physical seats.

**Event** — `id, organiserId, venueId, title, description, type, eventDate, startTime, status (DRAFT|PUBLISHED|CANCELLED), createdAt, updatedAt`.

**EventCategoryPrice** — `id, eventId, category, priceMinorUnits`. Unique on `(eventId, category)`. Pricing is per event, not hardcoded, and stored in integer minor units (paise) — never floating point.

**EventSeat** — `id, eventId, seatId, status (AVAILABLE|HELD|BOOKED), holdToken, holdUserId, holdExpiresAt, createdAt, updatedAt`. Unique on `(eventId, seatId)`. See above.

**Booking** — `id, reference (unique, e.g. TB-7F3KQ9XR), eventId, userId, status (CONFIRMED|CANCELLED), totalAmountMinorUnits, idempotencyKey (unique, nullable), createdAt, updatedAt, cancelledAt`. The public `reference` is a random 8-character code — never the database's sequential `id`.

**BookingSeat** — `id, bookingId, eventSeatId, priceMinorUnits`. Join table; one row per seat in a booking, with the price snapshotted at booking time (so a later price change on the event never alters a past booking's total). `eventSeatId` is *not* unique — a seat that's cancelled and later re-booked (directly or via the waitlist) gets a new `BookingSeat` row pointing at the same `EventSeat`. "A seat can't be booked twice **at the same time**" is enforced by the `EventSeat` status machine and row locking, not by a uniqueness constraint here; a naive unique constraint would permanently block re-booking a seat after its first booking was ever cancelled.

**WaitlistEntry** — `id, eventId, userId, category, status (WAITING|OFFERED|COMPLETED|EXPIRED), offeredSeatId, offerExpiresAt, createdAt, updatedAt`. FIFO ordering is `createdAt ASC` over `WAITING` rows within an `(eventId, category)`.

## Indexes

| Table | Index | Purpose |
|---|---|---|
| `EventSeat` | `(eventId, status)` | Seat map reads, availability queries |
| `EventSeat` | `(holdExpiresAt)` | Bulk expiry reconciliation |
| `EventSeat` | `(holdToken)` | Checkout lookup by hold |
| `Booking` | `(userId, createdAt)` | Booking history, newest first |
| `Booking` | `(eventId)` | Organiser revenue/summary aggregation |
| `BookingSeat` | `(eventSeatId)` | Cancellation seat lookups |
| `WaitlistEntry` | `(eventId, category, status, createdAt)` | FIFO candidate selection |
| `WaitlistEntry` | `(offerExpiresAt)` | Offer expiry reconciliation |

## Invariants not expressed as schema constraints

Two rules are enforced in the service layer (with transactions/locks) rather than as a database constraint, because Postgres can't express them declaratively without a partial/filtered unique index, which Prisma's schema DSL doesn't support:

- **At most one active `WaitlistEntry` per `(eventId, userId, category)`** — a user can have many `COMPLETED`/`EXPIRED` entries over time, but only one `WAITING` or `OFFERED` at once. Enforced with a Postgres advisory lock (`pg_advisory_xact_lock`) keyed to `(eventId, userId, category)` around the check-then-insert in `joinWaitlist`.
- **A seat is never booked twice at once** — enforced by the `EventSeat.status` state machine plus `SELECT ... FOR UPDATE` row locking in every mutating path (see [`SYSTEM_DESIGN.md`](SYSTEM_DESIGN.md)).

## Booking invariants

These are the correctness rules the system is built around. Each links to where it's enforced.

1. **One `EventSeat` belongs to exactly one `Event` + `Seat` combination** — `@@unique([eventId, seatId])` in the schema.
2. **`BOOKED` seats cannot be held** — `holdSeats` (`lib/seat/hold-service.ts`) only transitions a locked row to `HELD` if its current status is `AVAILABLE` or an expired `HELD`; a `BOOKED` row never matches.
3. **A valid `HELD` seat belongs to one active hold** — the hold's `holdToken` is a single cryptographically random value covering exactly the seats granted together in one transaction; no other transaction can attach a second token to the same row while it's locked.
4. **Expired `HELD` seats cannot be booked** — `confirmBooking` (`lib/booking/booking-service.ts`) checks `holdExpiresAt > now()` inside the same transaction that locks the row, throwing `HOLD_EXPIRED` otherwise.
5. **A booking can only contain seats from its event** — the hold and checkout queries filter `EventSeat` by `eventId` at every step; a hold token from event A can't be redeemed against event B.
6. **A user can only confirm their own hold** — `confirmBooking` compares every locked row's `holdUserId` to the caller, throwing `HOLD_OWNER_MISMATCH` otherwise.
7. **A cancelled booking cannot be cancelled twice** — `cancelBooking` (`lib/booking/cancellation-service.ts`) locks the `Booking` row and checks `status !== 'CANCELLED'` before proceeding, throwing `ALREADY_CANCELLED` otherwise.
8. **A waitlist offer can only be accepted by the offered user** — `acceptWaitlistOffer` (`lib/waitlist/waitlist-service.ts`) compares the locked `WaitlistEntry.userId` to the caller, throwing `OFFER_OWNER_MISMATCH` otherwise.
9. **An expired waitlist offer cannot be accepted** — the same function checks `offerExpiresAt > now()` with the row locked, throwing `OFFER_EXPIRED` otherwise.
10. **One seat cannot be successfully booked twice (at the same time)** — the `EventSeat.status` state machine plus `SELECT ... FOR UPDATE` locking (invariant enforced the same way as #2–4; see [`SYSTEM_DESIGN.md`](SYSTEM_DESIGN.md) for the concurrency mechanics and the 20-way race test that proves it).

## Money and time

All monetary fields are `Int` minor units (paise for INR). Timestamps are stored as `DateTime` (UTC) by Prisma/Postgres and formatted to the viewer's local time only at the UI boundary.
