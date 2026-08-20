# API Reference

All endpoints are Next.js Route Handlers under `/api`. Authentication is a signed, httpOnly session cookie (`session`) — no separate token to pass manually; the browser sends it automatically.

## Conventions

**Errors** — every error response has the shape:

```json
{ "error": { "code": "SEAT_UNAVAILABLE", "message": "One or more selected seats are no longer available." } }
```

| Code | HTTP status |
|---|---|
| `VALIDATION_ERROR` | 422 |
| `UNAUTHORIZED` | 401 |
| `FORBIDDEN` | 403 |
| `NOT_FOUND` | 404 |
| `SEAT_UNAVAILABLE` | 409 |
| `HOLD_EXPIRED` | 409 |
| `HOLD_NOT_FOUND` | 404 |
| `HOLD_OWNER_MISMATCH` | 403 |
| `DUPLICATE_WAITLIST_ENTRY` | 409 |
| `OFFER_EXPIRED` | 409 |
| `OFFER_OWNER_MISMATCH` | 403 |
| `ALREADY_CANCELLED` | 409 |
| `EVENT_ALREADY_STARTED` | 409 |
| `CONFLICT` | 409 |
| `RATE_LIMITED` | 429 |
| `INTERNAL_ERROR` | 500 |

**Money** — all amounts are integer minor units (paise), field-named `...MinorUnits`.

---

## Auth

### `POST /api/auth/register`
Auth: none. Creates a `CUSTOMER` or `ORGANISER` account (never `ADMIN`) and starts a session.

Request:
```json
{ "name": "Alex", "email": "alex@example.com", "password": "at-least-8-chars", "role": "CUSTOMER" }
```
Response `201`: `{ "user": { "id", "name", "email", "role" } }`
Errors: `VALIDATION_ERROR` (email already registered, weak password), `RATE_LIMITED` (more than 5 registrations per minute from one IP).

### `POST /api/auth/login`
Auth: none. Request: `{ "email", "password" }`. Response `200`: `{ "user": {...} }`.
Errors: `UNAUTHORIZED` (invalid credentials), `RATE_LIMITED` (more than 10 attempts per minute from one IP).

### `POST /api/auth/logout`
Auth: any. Clears the session cookie. Response `200`: `{ "success": true }`.

### `GET /api/auth/me`
Auth: none required. Response `200`: `{ "user": {...} | null }`.

---

## Events

### `GET /api/events`
Auth: none. Lists `PUBLISHED` events. Query params: `type`, `search` (title, case-insensitive substring).
Response `200`: `{ "events": [{ id, title, description, type, eventDate, startTime, status, venue, categoryPrices }] }`.

### `POST /api/events`
Auth: `ORGANISER`. Creates an event and initializes one `EventSeat` per seat in the venue.

Request:
```json
{
  "venueId": "...", "title": "...", "type": "CONCERT",
  "eventDate": "2026-12-25T19:00:00.000Z", "startTime": "2026-12-25T19:00:00.000Z",
  "status": "PUBLISHED",
  "categoryPrices": [{ "category": "PREMIUM", "priceMinorUnits": 150000 }]
}
```
Response `201`: `{ "event": {...} }`. Errors: `VALIDATION_ERROR`, `NOT_FOUND` (venue), `FORBIDDEN`.

### `GET /api/events/:eventId`
Auth: none required. `DRAFT` events are only visible to their organiser or an admin.
Response `200`: `{ "event": {...} }`. Errors: `NOT_FOUND`.

### `PATCH /api/events/:eventId`
Auth: `ORGANISER`, must own the event. Request: any subset of event fields. Response `200`: `{ "event": {...} }`.
Errors: `FORBIDDEN` (not the owner), `NOT_FOUND`.

---

## Seats, holds, and checkout

### `GET /api/events/:eventId/seats`
Auth: none required (an authenticated caller additionally sees `heldByCurrentUser`/`holdToken` on their own holds). Reconciles expired holds and waitlist offers before responding.
Response `200`: `{ "seats": [{ eventSeatId, seatId, row, number, category, status, heldByCurrentUser, holdToken }] }`.

### `POST /api/events/:eventId/hold`
Auth: any signed-in user. Atomically holds 1–8 seats, or none.

Request: `{ "seatIds": ["seat_1", "seat_2"] }`
Response `201`: `{ "hold": { "holdToken", "expiresAt", "eventSeatIds" } }`
Errors: `SEAT_UNAVAILABLE`, `NOT_FOUND` (seat doesn't belong to this event), `VALIDATION_ERROR`.

### `POST /api/events/:eventId/checkout`
Auth: the user who holds the seats. Confirms a hold into a booking.

Request: `{ "holdToken": "...", "idempotencyKey": "client-generated-uuid" }`
Response `201`: `{ "booking": { id, reference, eventId, userId, totalAmountMinorUnits, createdAt, seats } }`
Errors: `HOLD_NOT_FOUND`, `HOLD_OWNER_MISMATCH`, `HOLD_EXPIRED`. A retried request with the same `idempotencyKey` returns the original booking (still `201`) instead of erroring or duplicating it.

---

## Bookings

### `GET /api/bookings`
Auth: any signed-in user. Own bookings, newest first. Response `200`: `{ "bookings": [...] }`.

### `GET /api/bookings/:bookingId`
Auth: the booking's owner. Response `200`: `{ "booking": {...} }`. Errors: `NOT_FOUND`, `FORBIDDEN`.

### `POST /api/bookings/:bookingId/cancel`
Auth: the booking's owner. Cancels the booking, releases its seats, and — in the same transaction — offers each released seat to the earliest waiting customer for its category (or leaves it `AVAILABLE` if no one is waiting).
Response `200`: `{ "success": true }`. Errors: `NOT_FOUND`, `FORBIDDEN`, `ALREADY_CANCELLED`, `EVENT_ALREADY_STARTED` (an event already under way can no longer be cancelled).

---

## Waitlist

### `GET /api/events/:eventId/waitlist`
Auth: any signed-in user. The caller's own entries for this event. Response `200`: `{ "entries": [...] }`.

### `POST /api/events/:eventId/waitlist`
Auth: any signed-in user. Joins the FIFO waitlist for one category.
Request: `{ "category": "PREMIUM" }`
Response `201`: `{ "entry": {...} }`. Errors: `DUPLICATE_WAITLIST_ENTRY`.

### `POST /api/waitlist/:entryId/accept`
Auth: the user who was offered the seat. Accepts a live offer and confirms it into a booking.
Request: `{ "idempotencyKey": "client-generated-uuid" }`
Response `201`: `{ "booking": {...} }`. Errors: `NOT_FOUND`, `OFFER_OWNER_MISMATCH`, `OFFER_EXPIRED`.

This is the endpoint behind the time-limited link emailed to a waitlisted customer. That link points at the page `/waitlist/offer/:entryId`, which shows the live countdown and calls this endpoint on accept. The page is a convenience — ownership and expiry are validated here, server-side, on every attempt.

---

## Venues

### `GET /api/venues`
Auth: none. Response `200`: `{ "venues": [{ id, name, description, seats }] }`.

### `POST /api/venues`
Auth: `ADMIN`. Request: `{ "name", "description"? }`. Response `201`: `{ "venue": {...} }`.

### `GET /api/venues/:venueId`
Auth: none. Response `200`: `{ "venue": {...} }`. Errors: `NOT_FOUND`.

### `PATCH /api/venues/:venueId`
Auth: `ADMIN`. Request: any subset of `{ name, description }`. Response `200`: `{ "venue": {...} }`.

### `POST /api/venues/:venueId/seats`
Auth: `ADMIN`. Adds physical seats to a venue.
Request: `{ "seats": [{ "row": "A", "number": 1, "category": "PREMIUM" }] }`
Response `201`: `{ "venue": {...} }`. Errors: `CONFLICT` (duplicate row/number).

---

## Organiser

### `GET /api/organiser/dashboard`
Auth: `ORGANISER`. Live-computed totals and per-event booking/revenue summary for the caller's own events.
Response `200`: `{ "totals": { totalEvents, totalBookings, totalRevenueMinorUnits, upcomingEvents }, "events": [{ id, title, eventDate, status, venueName, totalSeats, ticketsSold, availableSeats, revenueMinorUnits, bookingsCount }] }`.
