import { Prisma, type SeatCategory } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { ApiError } from "@/lib/utils/api-error";
import { generateBookingReference } from "@/lib/utils/booking-reference";
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

const bookingWithSeatsInclude = {
  seats: {
    include: { eventSeat: { include: { seat: true } } },
  },
} satisfies Prisma.BookingInclude;

type BookingWithSeats = Prisma.BookingGetPayload<{ include: typeof bookingWithSeatsInclude }>;

function mapBooking(booking: BookingWithSeats): ConfirmedBooking {
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
 * Confirms a booking from an active hold. Atomic: either every held seat
 * transitions to BOOKED and the Booking/BookingSeat rows are created
 * together, or nothing changes.
 *
 * Idempotency: `idempotencyKey` is unique on Booking. A retried request with
 * the same key returns the original booking instead of creating a second
 * one — both on the fast pre-check and, to close the race between two
 * simultaneous retries, on a unique-constraint violation from the insert
 * itself.
 */
export async function confirmBooking(params: {
  eventId: string;
  userId: string;
  holdToken: string;
  idempotencyKey: string;
}): Promise<ConfirmedBooking> {
  const { eventId, userId, holdToken, idempotencyKey } = params;

  const existing = await prisma.booking.findUnique({
    where: { idempotencyKey },
    include: bookingWithSeatsInclude,
  });
  if (existing) {
    if (existing.userId !== userId) {
      throw new ApiError("CONFLICT", "This request has already been processed.");
    }
    return mapBooking(existing);
  }

  try {
    const booking = await prisma.$transaction(
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

        const categoryPrices = await tx.eventCategoryPrice.findMany({ where: { eventId } });
        const priceMap: CategoryPriceMap = Object.fromEntries(
          categoryPrices.map((cp) => [cp.category, cp.priceMinorUnits]),
        );

        const seatPrices = rows.map((row) => ({
          row,
          priceMinorUnits: priceForCategory(priceMap, row.category),
        }));
        const totalAmountMinorUnits = sumPrices(seatPrices.map((sp) => sp.priceMinorUnits));

        const reference = generateBookingReference();

        const created = await tx.booking.create({
          data: {
            reference,
            eventId,
            userId,
            totalAmountMinorUnits,
            idempotencyKey,
            seats: {
              create: seatPrices.map(({ row, priceMinorUnits }) => ({
                eventSeatId: row.eventSeatId,
                priceMinorUnits,
              })),
            },
          },
          include: bookingWithSeatsInclude,
        });

        await tx.eventSeat.updateMany({
          where: { id: { in: rows.map((row) => row.eventSeatId) } },
          data: { status: "BOOKED", holdToken: null, holdUserId: null, holdExpiresAt: null },
        });

        return created;
      },
      { timeout: 15_000, maxWait: 10_000 },
    );

    return mapBooking(booking);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002" &&
      (error.meta?.target as string[] | undefined)?.includes("idempotencyKey")
    ) {
      const winner = await prisma.booking.findUniqueOrThrow({
        where: { idempotencyKey },
        include: bookingWithSeatsInclude,
      });
      if (winner.userId !== userId) {
        throw new ApiError("CONFLICT", "This request has already been processed.");
      }
      return mapBooking(winner);
    }
    throw error;
  }
}
