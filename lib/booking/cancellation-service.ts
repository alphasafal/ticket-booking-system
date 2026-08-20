import { Prisma, type SeatCategory } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { ApiError } from "@/lib/utils/api-error";
import { offerToNextCandidateOrRelease, notifyWaitlistOffer } from "@/lib/waitlist/waitlist-service";

interface CancelledSeat {
  eventSeatId: string;
  category: SeatCategory;
}

/**
 * Cancels a booking and releases its seats. Atomic: the booking flips to
 * CANCELLED and every one of its seats is handed to the waitlist (or
 * released to AVAILABLE) together, or none of it happens. Each seat is
 * handed to its category's waitlist inside this same transaction — never
 * set to AVAILABLE first and reconciled afterward — so there is no window
 * where a released seat is visible as generally bookable before the
 * earliest waiting customer has had a chance at it.
 */
export async function cancelBooking(params: { bookingId: string; userId: string }): Promise<void> {
  const { bookingId, userId } = params;

  const { eventId, offers } = await prisma.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<
        { id: string; userId: string; status: string; eventId: string }[]
      >(Prisma.sql`
        SELECT id, "userId", status, "eventId" FROM "Booking" WHERE id = ${bookingId} FOR UPDATE
      `);
      const booking = rows[0];
      if (!booking) {
        throw new ApiError("NOT_FOUND", "Booking not found.");
      }
      if (booking.userId !== userId) {
        throw new ApiError("FORBIDDEN", "You do not own this booking.");
      }
      if (booking.status === "CANCELLED") {
        throw new ApiError("ALREADY_CANCELLED", "This booking has already been cancelled.");
      }

      const seatRows = await tx.$queryRaw<CancelledSeat[]>(Prisma.sql`
        SELECT bs."eventSeatId", s.category
        FROM "BookingSeat" bs
        JOIN "EventSeat" es ON es.id = bs."eventSeatId"
        JOIN "Seat" s ON s.id = es."seatId"
        WHERE bs."bookingId" = ${bookingId}
        ORDER BY bs."eventSeatId" ASC
        FOR UPDATE OF es
      `);

      await tx.booking.update({
        where: { id: bookingId },
        data: { status: "CANCELLED", cancelledAt: new Date() },
      });

      const offers: { category: SeatCategory; userId: string; offerExpiresAt: Date }[] = [];
      for (const seat of seatRows) {
        const offer = await offerToNextCandidateOrRelease(tx, {
          eventId: booking.eventId,
          category: seat.category,
          eventSeatId: seat.eventSeatId,
        });
        if (offer) {
          offers.push({ category: seat.category, userId: offer.userId, offerExpiresAt: offer.offerExpiresAt });
        }
      }

      return { eventId: booking.eventId, offers };
    },
    { timeout: 15_000, maxWait: 10_000 },
  );

  for (const offer of offers) {
    await notifyWaitlistOffer(eventId, offer.category, offer.userId, offer.offerExpiresAt);
  }
}
