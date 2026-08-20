import { Prisma, type EventSeatStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { ApiError } from "@/lib/utils/api-error";
import { DEFAULT_HOLD_TTL_MINUTES, MAX_SEATS_PER_BOOKING } from "@/lib/config/booking";
import { addMinutes } from "@/lib/utils/time";
import { generateHoldToken } from "./hold-token";

export interface HoldResult {
  holdToken: string;
  expiresAt: Date;
  eventSeatIds: string[];
}

interface LockedEventSeatRow {
  id: string;
  seatId: string;
  status: EventSeatStatus;
  holdExpiresAt: Date | null;
}

/**
 * Atomically holds a set of seats for one event, or holds none of them.
 *
 * Concurrency: all targeted EventSeat rows are locked with `SELECT ... FOR
 * UPDATE`, in a deterministic order (sorted by seatId), inside a single
 * transaction. Two overlapping requests therefore serialize on the shared
 * rows instead of deadlocking, and whichever transaction acquires the locks
 * first sees the current (possibly just-updated) status before the other
 * proceeds — so two simultaneous holds for the same seat can never both
 * succeed. Expired HELD rows are treated as AVAILABLE in the same check
 * (TTL is read, not relied on via a background job), and are overwritten
 * with the new hold in the same statement that would have set them from
 * AVAILABLE, so no separate reconciliation write is needed.
 */
export async function holdSeats(params: {
  eventId: string;
  userId: string;
  seatIds: string[];
}): Promise<HoldResult> {
  const { eventId, userId, seatIds } = params;

  if (seatIds.length === 0) {
    throw new ApiError("VALIDATION_ERROR", "At least one seat must be selected.");
  }
  if (seatIds.length > MAX_SEATS_PER_BOOKING) {
    throw new ApiError(
      "VALIDATION_ERROR",
      `A maximum of ${MAX_SEATS_PER_BOOKING} seats can be held at once.`,
    );
  }
  const uniqueSeatIds = [...new Set(seatIds)];

  return prisma.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<LockedEventSeatRow[]>(Prisma.sql`
        SELECT "id", "seatId", "status", "holdExpiresAt"
        FROM "EventSeat"
        WHERE "eventId" = ${eventId} AND "seatId" IN (${Prisma.join(uniqueSeatIds)})
        ORDER BY "seatId" ASC
        FOR UPDATE
      `);

      if (rows.length !== uniqueSeatIds.length) {
        throw new ApiError("NOT_FOUND", "One or more selected seats do not exist for this event.");
      }

      const now = new Date();
      const anyUnavailable = rows.some((row) => {
        const effectivelyAvailable =
          row.status === "AVAILABLE" ||
          (row.status === "HELD" && row.holdExpiresAt !== null && row.holdExpiresAt <= now);
        return !effectivelyAvailable;
      });

      if (anyUnavailable) {
        throw new ApiError(
          "SEAT_UNAVAILABLE",
          "One or more selected seats are no longer available.",
        );
      }

      const holdToken = generateHoldToken();
      const expiresAt = addMinutes(now, DEFAULT_HOLD_TTL_MINUTES);
      const eventSeatIds = rows.map((row) => row.id);

      await tx.eventSeat.updateMany({
        where: { id: { in: eventSeatIds } },
        data: {
          status: "HELD",
          holdToken,
          holdUserId: userId,
          holdExpiresAt: expiresAt,
        },
      });

      return { holdToken, expiresAt, eventSeatIds };
    },
    // Under heavy contention many requests queue on the same row lock(s);
    // give them room to wait their turn instead of erroring out.
    { timeout: 15_000, maxWait: 10_000 },
  );
}
