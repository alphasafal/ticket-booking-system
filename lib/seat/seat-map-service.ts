import { prisma } from "@/lib/db/prisma";

export interface SeatMapEntry {
  eventSeatId: string;
  seatId: string;
  row: string;
  number: number;
  category: string;
  status: "AVAILABLE" | "HELD" | "BOOKED";
  heldByCurrentUser: boolean;
}

// Expired holds are flipped back to AVAILABLE here as routine housekeeping
// so downstream reads see a clean state — but this is an optimization, not
// the correctness mechanism. holdExpiresAt is re-checked lazily by every
// path (hold, checkout) regardless of whether this has run recently.
export async function reconcileExpiredHolds(eventId?: string): Promise<number> {
  const now = new Date();
  const result = eventId
    ? await prisma.eventSeat.updateMany({
        where: { eventId, status: "HELD", holdExpiresAt: { lte: now } },
        data: { status: "AVAILABLE", holdToken: null, holdUserId: null, holdExpiresAt: null },
      })
    : await prisma.eventSeat.updateMany({
        where: { status: "HELD", holdExpiresAt: { lte: now } },
        data: { status: "AVAILABLE", holdToken: null, holdUserId: null, holdExpiresAt: null },
      });
  return result.count;
}

export async function getEventSeatMap(eventId: string, currentUserId: string | null): Promise<SeatMapEntry[]> {
  await reconcileExpiredHolds(eventId);

  const eventSeats = await prisma.eventSeat.findMany({
    where: { eventId },
    include: { seat: true },
    orderBy: [{ seat: { row: "asc" } }, { seat: { number: "asc" } }],
  });

  return eventSeats.map((es) => ({
    eventSeatId: es.id,
    seatId: es.seatId,
    row: es.seat.row,
    number: es.seat.number,
    category: es.seat.category,
    status: es.status,
    heldByCurrentUser: es.status === "HELD" && es.holdUserId === currentUserId,
  }));
}
