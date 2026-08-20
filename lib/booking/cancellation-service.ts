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
        { id: string; userId: string; status: string; eventId: string; startTime: Date }[]
      >(Prisma.sql`
        SELECT b.id, b."userId", b.status, b."eventId", e."startTime"
        FROM "Booking" b
        JOIN "Event" e ON e.id = b."eventId"
        WHERE b.id = ${bookingId}
        FOR UPDATE OF b
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
      // Releasing seats for an event that has already begun would be
      // meaningless, and worse, would email waitlisted customers an offer for
      // a show they can no longer attend.
      if (booking.startTime <= new Date()) {
        throw new ApiError(
          "EVENT_ALREADY_STARTED",
          "This event has already started, so the booking can no longer be cancelled.",
        );
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

      const offers: {
        waitlistEntryId: string;
        category: SeatCategory;
        userId: string;
        offerExpiresAt: Date;
      }[] = [];
      for (const seat of seatRows) {
        const offer = await offerToNextCandidateOrRelease(tx, {
          eventId: booking.eventId,
          category: seat.category,
          eventSeatId: seat.eventSeatId,
        });
        if (offer) {
          offers.push({ ...offer, category: seat.category });
        }
      }

      return { eventId: booking.eventId, offers };
    },
    { timeout: 15_000, maxWait: 10_000 },
  );

  for (const offer of offers) {
    await notifyWaitlistOffer({ ...offer, eventId });
  }
}
