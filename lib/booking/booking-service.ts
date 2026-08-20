import { Prisma, type SeatCategory } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { ApiError } from "@/lib/utils/api-error";
import { generateBookingReference } from "@/lib/utils/booking-reference";
import { generateBookingQrCode } from "@/lib/qr/qr-service";
import { sendBookingConfirmation } from "@/lib/email/email-service";
import { priceForCategory, sumPrices, type CategoryPriceMap } from "./pricing";

interface HeldSeatRow {
  eventSeatId: string;
  seatId: string;
  status: string;
  holdUserId: string | null;
  holdExpiresAt: Date | null;
  row: string;
  number: number;
  category: SeatCategory;
}

export interface ConfirmedBookingSeat {
  eventSeatId: string;
  seatId: string;
  row: string;
  number: number;
  category: SeatCategory;
  priceMinorUnits: number;
}

export interface ConfirmedBooking {
  id: string;
  reference: string;
  eventId: string;
  userId: string;
  totalAmountMinorUnits: number;
  createdAt: Date;
  seats: ConfirmedBookingSeat[];
}

export const bookingWithSeatsInclude = {
  seats: {
    include: { eventSeat: { include: { seat: true } } },
  },
} satisfies Prisma.BookingInclude;

export type BookingWithSeats = Prisma.BookingGetPayload<{ include: typeof bookingWithSeatsInclude }>;

export function mapBooking(booking: BookingWithSeats): ConfirmedBooking {
  return {
    id: booking.id,
    reference: booking.reference,
    eventId: booking.eventId,
    userId: booking.userId,
    totalAmountMinorUnits: booking.totalAmountMinorUnits,
    createdAt: booking.createdAt,
    seats: booking.seats.map((bs) => ({
      eventSeatId: bs.eventSeatId,
      seatId: bs.eventSeat.seatId,
      row: bs.eventSeat.seat.row,
      number: bs.eventSeat.seat.number,
      category: bs.eventSeat.seat.category,
      priceMinorUnits: bs.priceMinorUnits,
    })),
  };
}

/**
 * Creates the Booking + BookingSeat rows for a set of already-locked,
 * already-verified-available EventSeat rows. Callers (checkout, waitlist
 * offer acceptance) are responsible for locking and validating the seats
 * within their own transaction before calling this — pricing and reference
 * generation are the one shared source of truth for both flows.
 */
export async function createBookingRecord(
  tx: Prisma.TransactionClient,
  params: {
    eventId: string;
    userId: string;
    idempotencyKey: string;
    seatRows: { eventSeatId: string; category: SeatCategory }[];
  },
): Promise<BookingWithSeats> {
  const categoryPrices = await tx.eventCategoryPrice.findMany({ where: { eventId: params.eventId } });
  const priceMap: CategoryPriceMap = Object.fromEntries(
    categoryPrices.map((cp) => [cp.category, cp.priceMinorUnits]),
  );

  const seatPrices = params.seatRows.map((row) => ({
    eventSeatId: row.eventSeatId,
    priceMinorUnits: priceForCategory(priceMap, row.category),
  }));
  const totalAmountMinorUnits = sumPrices(seatPrices.map((sp) => sp.priceMinorUnits));

  return tx.booking.create({
    data: {
      reference: generateBookingReference(),
      eventId: params.eventId,
      userId: params.userId,
      totalAmountMinorUnits,
      idempotencyKey: params.idempotencyKey,
      seats: { create: seatPrices },
    },
    include: bookingWithSeatsInclude,
  });
}

function isIdempotencyKeyConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002" &&
    !!(error.meta?.target as string[] | undefined)?.includes("idempotencyKey")
  );
}

export interface IdempotentBookingResult {
  booking: ConfirmedBooking;
  // False when this call returned a booking created by an earlier request
  // with the same idempotencyKey. Callers use this to avoid re-sending the
  // confirmation email on a retried request.
  isNew: boolean;
}

/**
 * Runs `createFn` (which must create exactly one Booking with the given
 * idempotencyKey) and makes the whole operation idempotent: a retried
 * request with the same key returns the original booking instead of
 * creating a second one. Handles both the common case (fast pre-check) and
 * the race between two simultaneous retries (unique-constraint violation on
 * the insert itself).
 */
export async function withIdempotentBooking(
  idempotencyKey: string,
  userId: string,
  createFn: () => Promise<BookingWithSeats>,
): Promise<IdempotentBookingResult> {
  const existing = await prisma.booking.findUnique({
    where: { idempotencyKey },
    include: bookingWithSeatsInclude,
  });
  if (existing) {
    if (existing.userId !== userId) {
      throw new ApiError("CONFLICT", "This request has already been processed.");
    }
    return { booking: mapBooking(existing), isNew: false };
  }

  try {
    const created = await createFn();
    return { booking: mapBooking(created), isNew: true };
  } catch (error) {
    if (isIdempotencyKeyConflict(error)) {
      const winner = await prisma.booking.findUniqueOrThrow({
        where: { idempotencyKey },
        include: bookingWithSeatsInclude,
      });
      if (winner.userId !== userId) {
        throw new ApiError("CONFLICT", "This request has already been processed.");
      }
      return { booking: mapBooking(winner), isNew: false };
    }
    throw error;
  }
}

/**
 * Confirms a booking from an active hold. Atomic: either every held seat
 * transitions to BOOKED and the Booking/BookingSeat rows are created
 * together, or nothing changes. See withIdempotentBooking for the
 * duplicate-request handling.
 */
export async function confirmBooking(params: {
  eventId: string;
  userId: string;
  holdToken: string;
  idempotencyKey: string;
}): Promise<IdempotentBookingResult> {
  const { eventId, userId, holdToken, idempotencyKey } = params;

  return withIdempotentBooking(idempotencyKey, userId, () =>
    prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<HeldSeatRow[]>(Prisma.sql`
          SELECT es.id as "eventSeatId", es."seatId", es.status, es."holdUserId", es."holdExpiresAt",
                 s.row, s.number, s.category
          FROM "EventSeat" es
          JOIN "Seat" s ON s.id = es."seatId"
          WHERE es."eventId" = ${eventId} AND es."holdToken" = ${holdToken}
          ORDER BY es.id ASC
          FOR UPDATE OF es
        `);

        if (rows.length === 0) {
          throw new ApiError("HOLD_NOT_FOUND", "This hold no longer exists.");
        }
        if (rows.some((row) => row.holdUserId !== userId)) {
          throw new ApiError("HOLD_OWNER_MISMATCH", "This hold does not belong to you.");
        }
        const now = new Date();
        if (
          rows.some(
            (row) => row.status !== "HELD" || !row.holdExpiresAt || row.holdExpiresAt <= now,
          )
        ) {
          throw new ApiError("HOLD_EXPIRED", "This hold has expired. Please select seats again.");
        }

        const created = await createBookingRecord(tx, {
          eventId,
          userId,
          idempotencyKey,
          seatRows: rows,
        });

        await tx.eventSeat.updateMany({
          where: { id: { in: rows.map((row) => row.eventSeatId) } },
          data: { status: "BOOKED", holdToken: null, holdUserId: null, holdExpiresAt: null },
        });

        return created;
      },
      { timeout: 15_000, maxWait: 10_000 },
    ),
  );
}

/**
 * Generates the QR code and sends the confirmation email for a booking.
 * Always called after the booking transaction has committed — never inside
 * it, so a slow or failing email provider can never hold a database lock or
 * roll back an otherwise-successful booking.
 */
export async function notifyBookingConfirmed(booking: ConfirmedBooking): Promise<void> {
  const [user, event] = await Promise.all([
    prisma.user.findUnique({ where: { id: booking.userId } }),
    prisma.event.findUnique({ where: { id: booking.eventId }, include: { venue: true } }),
  ]);
  if (!user || !event) return;

  const qrDataUrl = await generateBookingQrCode(booking.reference);

  await sendBookingConfirmation({
    to: user.email,
    reference: booking.reference,
    eventTitle: event.title,
    venueName: event.venue.name,
    eventDate: event.eventDate,
    seats: booking.seats.map((s) => ({ row: s.row, number: s.number })),
    qrDataUrl,
  });
}
