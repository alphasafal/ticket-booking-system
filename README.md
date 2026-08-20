# Ticket Booking System

A ticket booking platform for movies and concerts: venues and seat layouts, a live seat map, TTL-based seat holds with row-level concurrency protection, atomic checkout with QR tickets by email, cancellation, and FIFO per-category waitlists with time-limited offers.

### 🔗 Live demo — **https://ticket-booking-system-alphasafals-projects.vercel.app**

Sign in with any of these (password `password123` for all):

| Role | Email |
|---|---|
| Customer | `customer@ticketbooking.dev` |
| Organiser | `organiser@ticketbooking.dev` |
| Admin | `admin@ticketbooking.dev` |
| Customer on a waitlist | `waitlisted@ticketbooking.dev` |

**Docs:** [System design](docs/SYSTEM_DESIGN.md) · [API reference](docs/API.md) · [Database schema](docs/DATABASE.md)

### Quick tour

1. Open the [concert event](https://ticket-booking-system-alphasafals-projects.vercel.app/events) as `customer@` — the seat map shows available, held, and booked seats from real database state.
2. Select seats and hold them; open the same event in a second browser to see them locked to everyone else.
3. Check out — you get a booking reference, a QR ticket, and a confirmation email.
4. Row A (Premium) is sold out, and `waitlisted@` is already queued for that category. Cancel the Premium booking as `customer@` (My bookings → the 8-seat booking) — a released seat is offered to `waitlisted@` automatically, who sees it under **My bookings** with a countdown and can claim it in one click.
5. As `organiser@`, view live booking and revenue totals on the dashboard.

## Features

- Customer, organiser, and admin accounts with role-based authorization and ownership checks
- Venue and seat-layout management (rows, categories)
- Event creation with per-category pricing and automatic per-event seat inventory
- Live seat map (available / held / booked, short-polled) with accessible, non-color-only state indicators
- Transactional seat holds with a configurable TTL, immune to double-booking under concurrency
- Idempotent checkout, unique human-readable booking references, QR ticket generation
- Booking history and cancellation
- Category-specific FIFO waitlists with automatic, atomic cancellation → offer handoff and time-limited offer expiry/advancement
- Organiser dashboard with live booking and revenue aggregation
- Transactional-email confirmations (console-logged in development)

## Architecture

Single Next.js (App Router) application — no separate backend service.

```
UI (Server + Client Components)
  → app/api/**  (Route Handlers, thin — auth, validation, delegate to services)
    → lib/{auth,seat,booking,waitlist,venue,event,email,qr}  (business logic, the only place invariants are enforced)
      → Prisma → PostgreSQL
```

Business logic lives exclusively in `lib/`. Route handlers validate input (Zod) and call a service function; components never talk to Prisma directly. See [`docs/SYSTEM_DESIGN.md`](docs/SYSTEM_DESIGN.md) for the concurrency/TTL/waitlist design in depth, and [`docs/DATABASE.md`](docs/DATABASE.md) for the schema.

## Tech stack

- **Framework**: Next.js 16 (App Router), React 19, TypeScript (`strict: true`)
- **Styling**: Tailwind CSS
- **Database**: PostgreSQL, via Prisma ORM (raw SQL + `SELECT ... FOR UPDATE` for locking where Prisma's query builder can't express it)
- **Validation**: Zod
- **Auth**: bcrypt password hashing + signed, httpOnly session cookies (HMAC, no external auth service)
- **QR**: `qrcode`
- **Email**: `resend` (console-logged in development if no API key is set)
- **Testing**: Vitest (unit, integration, concurrency)

## Prerequisites

- Node.js 20+
- Docker (for local PostgreSQL) — or any PostgreSQL 16+ instance

## Installation

```bash
npm install
```

## Environment variables

Copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `AUTH_SECRET` | HMAC secret for session cookies — generate with `openssl rand -base64 32` |
| `RESEND_API_KEY` | Optional in development; emails are logged to the console if unset |
| `EMAIL_FROM` | From address for transactional email |
| `NEXT_PUBLIC_APP_URL` | Base URL used in email links |

`lib/config/env.ts` validates these at startup and fails with a clear error if anything required is missing — the app never starts in a half-configured state.

## Database setup

Start local Postgres (docker-compose maps it to **port 55432**, not 5432, to avoid colliding with any Postgres already running on your machine):

```bash
docker compose up -d
```

## Migrations

```bash
npm run db:migrate
```

## Seed data

```bash
npm run db:seed
```

Idempotent — safe to re-run. Creates a venue with 40 seats (2 premium rows, 3 standard rows), a concert and a movie event, and enough booked/held/waitlisted state to see every seat status and the waitlist flow immediately.

### Demo accounts

All use password `password123`.

| Role | Email |
|---|---|
| Admin | `admin@ticketbooking.dev` |
| Organiser | `organiser@ticketbooking.dev` |
| Customer | `customer@ticketbooking.dev` |
| Customer (on the waitlist) | `waitlisted@ticketbooking.dev` |

## Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## API overview

See [`docs/API.md`](docs/API.md) for the full reference. Summary: `/api/auth/*` (register/login/logout), `/api/events` + `/api/events/:id` (browse/manage), `/api/events/:id/seats` (live seat map), `/api/events/:id/hold` + `/api/events/:id/checkout` (booking flow), `/api/bookings/*` (history/cancel), `/api/events/:id/waitlist` + `/api/waitlist/:id/accept` (waitlist), `/api/venues/*` (admin), `/api/organiser/dashboard`.

## Concurrency strategy

Every seat mutation locks the exact `EventSeat` rows involved with `SELECT ... FOR UPDATE`, in deterministic order, inside one transaction — availability is checked after the lock is acquired, not before, closing the classic read-then-write race entirely. A multi-seat hold is all-or-nothing. Proven with a test that fires 20 concurrent hold requests at one seat and asserts exactly one winner. Full detail in [`docs/SYSTEM_DESIGN.md`](docs/SYSTEM_DESIGN.md).

## Seat hold / TTL strategy

`holdExpiresAt` on `EventSeat` is the sole authority for expiry — every read and write path lazily treats a `HELD` row past its expiry as `AVAILABLE`, inline, inside its own lock. A best-effort reconciliation pass runs on every seat-map read as housekeeping, but nothing depends on it having run.

## Waitlist strategy

Per-`(event, category)` FIFO queue. Cancellation hands a released seat to the earliest waiting customer (or releases it to `AVAILABLE`) **inside the same transaction** as the cancellation itself, so the seat is never visible as generally bookable before the waitlist has had first claim. Offer expiry and acceptance both lock the `WaitlistEntry` row, so two concurrent attempts to consume the same offer can never both succeed.

## QR / email

QR codes encode the booking reference and are generated only after a booking commits successfully. Email is sent after the database transaction commits, never inside it — an email provider outage is logged but never rolls back or invalidates a successful booking.

Delivery is deferred with `after()` from `next/server` rather than left as a floating promise: it keeps the confirmation response fast while guaranteeing the serverless invocation stays alive until the mail is actually sent. A bare un-awaited promise is silently dropped when the function freezes after responding.

Mail is sent through Resend from a verified domain (`send.safalgupta.tech`, DKIM + SPF), so confirmations reach any recipient. With `RESEND_API_KEY` unset — the default for local development — emails are logged to the console instead, and the app warns loudly if the key is missing in production.

## Testing

```bash
npm test
```

41 tests across three layers:

- **Unit** (`tests/unit`) — booking reference generation, pricing, TTL time math, centralized error mapping
- **Integration** (`tests/integration`) — booking confirmation invariants (idempotency, hold ownership, expiry), cross-organiser event ownership, organiser revenue/seat-count aggregation, rate limiting
- **Concurrency** (`tests/concurrency`) — 20-way seat hold race, partial-hold rejection, FIFO waitlist assignment, concurrent offer acceptance, offer expiry/advancement, atomic rate-limit counting under 20 simultaneous requests

Tests run against a real PostgreSQL database (the same local instance as development) using Prisma, not mocks.

## Deployment

**Live**: [https://ticket-booking-system-alphasafals-projects.vercel.app](https://ticket-booking-system-alphasafals-projects.vercel.app)

Deployed on **Vercel** (frontend/API) with **Neon** Postgres for the database, seeded with the same demo data described above. To redeploy or replicate:

1. Set `DATABASE_URL`, `AUTH_SECRET`, `EMAIL_FROM`, `NEXT_PUBLIC_APP_URL` (and optionally `RESEND_API_KEY`) as Production environment variables on Vercel — same names as `.env.example`.
2. `npx prisma migrate deploy` against the production database.
3. `npx tsx prisma/seed.ts` once, against the production database, for demo data.
4. `vercel deploy --prod`.

Note: `package.json` has a `postinstall: prisma generate` script — required so Vercel's cached-dependency builds regenerate the Prisma client instead of using a stale one.

## Project structure

```
app/            Routes: pages (Server Components) + app/api (Route Handlers)
components/     UI components, grouped by domain
lib/            Business logic — the only place invariants are enforced
  auth/         Password hashing, sessions, RBAC
  booking/      Checkout, cancellation, pricing
  seat/         Holds, seat map reads
  waitlist/     FIFO join, offer assignment, acceptance, expiry
  email/        Isolated email service
  qr/           QR generation
  venue/ event/ Venue and event management
  config/       Typed env validation + business constants
  validation/   Zod schemas
  utils/        Small, focused helpers (currency, time, errors)
prisma/         schema.prisma, migrations, seed.ts
tests/          unit / integration / concurrency
docs/           API.md, DATABASE.md, SYSTEM_DESIGN.md
```

## Known limitations

- No payment gateway — checkout is a simulated confirmation, as specified.
- Email sends from a newly verified domain, so the first messages to a given provider may land in Promotions/Spam until it builds reputation. DKIM and SPF are configured.
- Real-time seat updates use short polling (every 3s), not WebSockets, per the assignment's stated requirement.
- Event cancellation (`status: CANCELLED`) does not cascade-cancel existing bookings — out of scope without a payment/refund system.
- Rate limiting is a fixed window rather than a sliding one, so a burst can straddle a window boundary. It is deliberately backed by the existing Postgres rather than Redis, which the project's constraints exclude.
- The local dev/test setup uses one Postgres database for both; a dedicated test database would be a natural next step for a larger team.

## Development highlights

- Database-first architecture with `EventSeat` as the single per-event inventory row
- Row-level `SELECT ... FOR UPDATE` concurrency protection, not application-level locking
- TTL-based holds and offers, checked lazily everywhere rather than relying on a scheduler
- FIFO category waitlists with atomic, in-transaction cancellation handoff
- Idempotent booking confirmation via a client-supplied key
- Automated concurrency tests that actually prove the guarantees, not just assert happy paths
