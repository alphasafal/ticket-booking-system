import type { EventSeat } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { reconcileExpiredWaitlistOffers } from "@/lib/waitlist/waitlist-service";

export interface SeatMapEntry {
  eventSeatId: string;
  seatId: string;
  row: string;
  number: number;
  category: string;
  status: "AVAILABLE" | "HELD" | "BOOKED";
  heldByCurrentUser: boolean;
  // Only populated when heldByCurrentUser is true — never expose another
  // user's hold token. Lets the checkout page scope itself to exactly the
  // seats from one hold, even if the same user has another hold elsewhere.
  holdToken: string | null;
}

// True if this row is a HELD seat whose TTL has already passed, i.e. it is
// effectively free even though its stored status still says HELD.
export function isExpiredHold(
  seat: Pick<EventSeat, "status" | "holdExpiresAt">,
  now = new Date(),
): boolean {
  return seat.status === "HELD" && seat.holdExpiresAt !== null && seat.holdExpiresAt <= now;
}

// Expired holds are flipped back to AVAILABLE here as routine housekeeping
// so downstream reads see a clean state — but this is an optimization, not
// the correctness mechanism. holdExpiresAt is re-checked lazily by every
// path (hold, checkout) regardless of whether this has run recently.
//
// Only rows with holdUserId set are touched — those are self-service
// customer holds. A HELD row with holdUserId = null is a waitlist offer,
// and its expiry must go through expireAndAdvanceOffer (via
// reconcileExpiredWaitlistOffers) so the seat is handed to the next waiting
// customer instead of just becoming generally available.
export async function reconcileExpiredHolds(eventIds?: string[]): Promise<number> {
  const result = await prisma.eventSeat.updateMany({
    where: {
      ...(eventIds ? { eventId: { in: eventIds } } : {}),
      status: "HELD",
      holdExpiresAt: { lte: new Date() },
      holdUserId: { not: null },
    },
    data: { status: "AVAILABLE", holdToken: null, holdUserId: null, holdExpiresAt: null },
  });
  return result.count;
}

/**
 * Brings seat inventory in line with elapsed TTLs: expired customer holds go
 * back to AVAILABLE, and expired waitlist offers advance to the next person
 * in the queue. Every read path that reports seat *counts or statuses* to a
 * user must call this first, otherwise it will report stale HELD rows as
 * unavailable when they are effectively free.
 */
export async function reconcileEventInventory(eventIds?: string[]): Promise<void> {
  await reconcileExpiredHolds(eventIds);
  await reconcileExpiredWaitlistOffers(eventIds);
}

function fetchSeatsWithSeat(eventId: string) {
  return prisma.eventSeat.findMany({
    where: { eventId },
    include: { seat: true },
    orderBy: [{ seat: { row: "asc" } }, { seat: { number: "asc" } }],
  });
}

export async function getEventSeatMap(eventId: string, currentUserId: string | null): Promise<SeatMapEntry[]> {
  // Fast path: this endpoint is polled every few seconds by every viewer, so
  // read first and only pay for reconciliation writes when something has
  // actually expired. In the common case this request performs no writes.
  let eventSeats = await fetchSeatsWithSeat(eventId);
  if (eventSeats.some((es) => isExpiredHold(es))) {
    await reconcileEventInventory([eventId]);
    eventSeats = await fetchSeatsWithSeat(eventId);
  }

  return eventSeats.map((es) => {
    const heldByCurrentUser = es.status === "HELD" && es.holdUserId === currentUserId;
    return {
      eventSeatId: es.id,
      seatId: es.seatId,
      row: es.seat.row,
      number: es.seat.number,
      category: es.seat.category,
      status: es.status,
      heldByCurrentUser,
      holdToken: heldByCurrentUser ? es.holdToken : null,
    };
  });
}
