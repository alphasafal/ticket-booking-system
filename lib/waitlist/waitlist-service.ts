import { Prisma, type SeatCategory } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { ApiError } from "@/lib/utils/api-error";
import { acquireAdvisoryLock } from "@/lib/db/advisory-lock";
import { WAITLIST_OFFER_TTL_MINUTES } from "@/lib/config/booking";
import { addMinutes } from "@/lib/utils/time";
import { sendWaitlistOffer } from "@/lib/email/email-service";
import { env } from "@/lib/config/env";
import {
  createBookingRecord,
  withIdempotentBooking,
  type IdempotentBookingResult,
} from "@/lib/booking/booking-service";

export interface WaitlistEntryDTO {
  id: string;
  eventId: string;
  userId: string;
  category: SeatCategory;
  status: "WAITING" | "OFFERED" | "COMPLETED" | "EXPIRED";
  offeredSeatId: string | null;
  offerExpiresAt: Date | null;
  createdAt: Date;
}

/**
 * Joins the FIFO waitlist for one event+category. An advisory lock on the
 * (eventId, userId, category) key serializes concurrent join attempts from
 * the same user, since that "at most one active entry" rule has no
 * dedicated unique index (see prisma/schema.prisma).
 */
export async function joinWaitlist(params: {
  eventId: string;
  userId: string;
  category: SeatCategory;
}): Promise<WaitlistEntryDTO> {
  const { eventId, userId, category } = params;

  return prisma.$transaction(async (tx) => {
    await acquireAdvisoryLock(tx, `waitlist:${eventId}:${userId}:${category}`);

    const existing = await tx.waitlistEntry.findFirst({
      where: { eventId, userId, category, status: { in: ["WAITING", "OFFERED"] } },
    });
    if (existing) {
      throw new ApiError(
        "DUPLICATE_WAITLIST_ENTRY",
        "You already have an active waitlist entry for this category.",
      );
    }

    return tx.waitlistEntry.create({ data: { eventId, userId, category, status: "WAITING" } });
  });
}

/**
 * Given a seat that the caller has already locked (`FOR UPDATE`) and
 * confirmed is free to give away, either offers it to the earliest WAITING
 * entry for that event+category (FIFO by createdAt) or, if no one is
 * waiting, releases it to AVAILABLE. Must run inside the caller's
 * transaction so the seat is never visible as generally AVAILABLE while a
 * waitlist candidate could still claim it first.
 */
export async function offerToNextCandidateOrRelease(
  tx: Prisma.TransactionClient,
  params: { eventId: string; category: SeatCategory; eventSeatId: string },
): Promise<{ waitlistEntryId: string; userId: string; offerExpiresAt: Date } | null> {
  const candidateRows = await tx.$queryRaw<{ id: string; userId: string }[]>(Prisma.sql`
    SELECT id, "userId" FROM "WaitlistEntry"
    WHERE "eventId" = ${params.eventId} AND category = ${params.category}::"SeatCategory" AND status = 'WAITING'
    ORDER BY "createdAt" ASC
    LIMIT 1
    FOR UPDATE
  `);
  const candidate = candidateRows[0];

  if (!candidate) {
    await tx.eventSeat.update({
      where: { id: params.eventSeatId },
      data: { status: "AVAILABLE", holdToken: null, holdUserId: null, holdExpiresAt: null },
    });
    return null;
  }

  const offerExpiresAt = addMinutes(new Date(), WAITLIST_OFFER_TTL_MINUTES);

  await tx.waitlistEntry.update({
    where: { id: candidate.id },
    data: { status: "OFFERED", offeredSeatId: params.eventSeatId, offerExpiresAt },
  });
  // The seat is HELD for the offer, same as a customer hold, but with no
  // holdUserId/holdToken — those fields identify a self-service customer
  // hold specifically, and their absence is how reconcileExpiredHolds knows
  // to leave offer-holds for the waitlist reconciliation path instead.
  await tx.eventSeat.update({
    where: { id: params.eventSeatId },
    data: { status: "HELD", holdExpiresAt: offerExpiresAt, holdToken: null, holdUserId: null },
  });

  return { waitlistEntryId: candidate.id, userId: candidate.userId, offerExpiresAt };
}

export async function notifyWaitlistOffer(params: {
  waitlistEntryId: string;
  eventId: string;
  category: SeatCategory;
  userId: string;
  offerExpiresAt: Date;
}): Promise<void> {
  const [user, event] = await Promise.all([
    prisma.user.findUnique({ where: { id: params.userId } }),
    prisma.event.findUnique({ where: { id: params.eventId } }),
  ]);
  if (!user || !event) return;

  await sendWaitlistOffer({
    to: user.email,
    eventTitle: event.title,
    category: params.category,
    offerExpiresAt: params.offerExpiresAt,
    // Deep link straight to the offer so the customer can complete the
    // booking in one click, for as long as the offer is still live.
    acceptUrl: `${env.NEXT_PUBLIC_APP_URL}/waitlist/offer/${params.waitlistEntryId}`,
  });
}

/**
 * Expires one OFFERED entry past its TTL and hands the seat to the next
 * candidate (or releases it) in the same transaction. Two concurrent
 * attempts to expire/accept the same offer cannot both succeed: both lock
 * the WaitlistEntry row, and whichever commits first flips its status, so
 * the second sees a status that is no longer OFFERED and no-ops.
 */
export async function expireAndAdvanceOffer(waitlistEntryId: string): Promise<void> {
  const result = await prisma.$transaction(
    async (tx) => {
      const entryRows = await tx.$queryRaw<
        {
          id: string;
          status: string;
          offerExpiresAt: Date | null;
          offeredSeatId: string | null;
          eventId: string;
          category: SeatCategory;
        }[]
      >(Prisma.sql`
        SELECT id, status, "offerExpiresAt", "offeredSeatId", "eventId", category
        FROM "WaitlistEntry" WHERE id = ${waitlistEntryId} FOR UPDATE
      `);
      const entry = entryRows[0];
      if (
        !entry ||
        entry.status !== "OFFERED" ||
        !entry.offerExpiresAt ||
        entry.offerExpiresAt > new Date() ||
        !entry.offeredSeatId
      ) {
        return null;
      }

      await tx.waitlistEntry.update({ where: { id: entry.id }, data: { status: "EXPIRED" } });

      const seatRows = await tx.$queryRaw<{ id: string; status: string; holdUserId: string | null }[]>(
        Prisma.sql`SELECT id, status, "holdUserId" FROM "EventSeat" WHERE id = ${entry.offeredSeatId} FOR UPDATE`,
      );
      const seat = seatRows[0];
      // Only reclaim the seat if it's still exactly as this offer left it.
      // If a customer hold has since taken it over via the seat map's own
      // lazy-expiry check, leave it alone — the entry above is still
      // correctly marked EXPIRED either way.
      if (!seat || seat.status !== "HELD" || seat.holdUserId !== null) {
        return null;
      }

      return offerToNextCandidateOrRelease(tx, {
        eventId: entry.eventId,
        category: entry.category,
        eventSeatId: entry.offeredSeatId,
      });
    },
    { timeout: 15_000, maxWait: 10_000 },
  );

  if (result) {
    // The expired entry and the newly offered one share an event+category
    // queue, so the expired row is a safe source for those two fields.
    const entry = await prisma.waitlistEntry.findUnique({
      where: { id: waitlistEntryId },
      select: { eventId: true, category: true },
    });
    if (entry) {
      await notifyWaitlistOffer({
        waitlistEntryId: result.waitlistEntryId,
        eventId: entry.eventId,
        category: entry.category,
        userId: result.userId,
        offerExpiresAt: result.offerExpiresAt,
      });
    }
  }
}

// Backs the time-limited offer link sent by email. Reconciles first so a
// lapsed offer is shown as expired (and passed on) rather than as claimable.
export async function getWaitlistOfferDetail(entryId: string) {
  const entry = await prisma.waitlistEntry.findUnique({
    where: { id: entryId },
    select: { eventId: true },
  });
  if (!entry) return null;

  await reconcileExpiredWaitlistOffers([entry.eventId]);

  return prisma.waitlistEntry.findUnique({
    where: { id: entryId },
    include: {
      event: { include: { venue: true, categoryPrices: true } },
      offeredSeat: { include: { seat: true } },
    },
  });
}

export function getUserWaitlistEntries(userId: string) {
  return prisma.waitlistEntry.findMany({
    where: { userId, status: { in: ["WAITING", "OFFERED"] } },
    orderBy: { createdAt: "desc" },
    include: { event: { include: { venue: true } } },
  });
}

export async function reconcileExpiredWaitlistOffers(eventIds?: string[]): Promise<void> {
  const expired = await prisma.waitlistEntry.findMany({
    where: {
      status: "OFFERED",
      offerExpiresAt: { lte: new Date() },
      ...(eventIds ? { eventId: { in: eventIds } } : {}),
    },
    select: { id: true },
  });
  for (const entry of expired) {
    await expireAndAdvanceOffer(entry.id);
  }
}

/**
 * Accepts a live offer. Only the offered user can accept, and only before
 * offerExpiresAt — both enforced with the WaitlistEntry row locked, so this
 * can't race a concurrent expireAndAdvanceOffer for the same entry.
 */
export async function acceptWaitlistOffer(params: {
  waitlistEntryId: string;
  userId: string;
  idempotencyKey: string;
}): Promise<IdempotentBookingResult> {
  const { waitlistEntryId, userId, idempotencyKey } = params;

  return withIdempotentBooking(idempotencyKey, userId, () =>
    prisma.$transaction(
      async (tx) => {
        const entryRows = await tx.$queryRaw<
          {
            id: string;
            userId: string;
            status: string;
            offerExpiresAt: Date | null;
            offeredSeatId: string | null;
            eventId: string;
          }[]
        >(Prisma.sql`
          SELECT id, "userId", status, "offerExpiresAt", "offeredSeatId", "eventId"
          FROM "WaitlistEntry" WHERE id = ${waitlistEntryId} FOR UPDATE
        `);
        const entry = entryRows[0];
        if (!entry) {
          throw new ApiError("NOT_FOUND", "Waitlist offer not found.");
        }
        if (entry.userId !== userId) {
          throw new ApiError("OFFER_OWNER_MISMATCH", "This offer does not belong to you.");
        }
        if (entry.status !== "OFFERED" || !entry.offerExpiresAt || !entry.offeredSeatId) {
          throw new ApiError("OFFER_EXPIRED", "This offer is no longer available.");
        }
        if (entry.offerExpiresAt <= new Date()) {
          throw new ApiError("OFFER_EXPIRED", "This offer has expired.");
        }

        const seatRows = await tx.$queryRaw<{ eventSeatId: string; category: SeatCategory }[]>(Prisma.sql`
          SELECT es.id as "eventSeatId", s.category
          FROM "EventSeat" es JOIN "Seat" s ON s.id = es."seatId"
          WHERE es.id = ${entry.offeredSeatId}
          FOR UPDATE OF es
        `);
        const seat = seatRows[0];
        if (!seat) {
          throw new ApiError("OFFER_EXPIRED", "This offer is no longer available.");
        }

        const created = await createBookingRecord(tx, {
          eventId: entry.eventId,
          userId,
          idempotencyKey,
          seatRows: [seat],
        });

        await tx.eventSeat.update({
          where: { id: seat.eventSeatId },
          data: { status: "BOOKED", holdToken: null, holdUserId: null, holdExpiresAt: null },
        });
        await tx.waitlistEntry.update({ where: { id: entry.id }, data: { status: "COMPLETED" } });

        return created;
      },
      { timeout: 15_000, maxWait: 10_000 },
    ),
  );
}
