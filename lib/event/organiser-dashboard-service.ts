import { prisma } from "@/lib/db/prisma";

export interface OrganiserEventSummary {
  id: string;
  title: string;
  eventDate: Date;
  status: string;
  venueName: string;
  totalSeats: number;
  ticketsSold: number;
  availableSeats: number;
  revenueMinorUnits: number;
  bookingsCount: number;
}

export interface OrganiserDashboard {
  totals: {
    totalEvents: number;
    totalBookings: number;
    totalRevenueMinorUnits: number;
    upcomingEvents: number;
  };
  events: OrganiserEventSummary[];
}

// All figures are computed live from Booking/EventSeat rows — never cached
// or hardcoded — so the dashboard can never drift from what actually
// happened in the database.
export async function getOrganiserDashboard(organiserId: string): Promise<OrganiserDashboard> {
  const events = await prisma.event.findMany({
    where: { organiserId },
    orderBy: { eventDate: "asc" },
    include: { venue: true, _count: { select: { eventSeats: true } } },
  });
  const eventIds = events.map((e) => e.id);

  const [bookingAggregates, seatStatusCounts] = await Promise.all([
    prisma.booking.groupBy({
      by: ["eventId"],
      where: { eventId: { in: eventIds }, status: "CONFIRMED" },
      _sum: { totalAmountMinorUnits: true },
      _count: { _all: true },
    }),
    prisma.eventSeat.groupBy({
      by: ["eventId", "status"],
      where: { eventId: { in: eventIds } },
      _count: { _all: true },
    }),
  ]);

  const bookingsByEvent = new Map(bookingAggregates.map((b) => [b.eventId, b]));
  const seatCountsByEvent = new Map<string, Record<string, number>>();
  for (const row of seatStatusCounts) {
    const entry = seatCountsByEvent.get(row.eventId) ?? {};
    entry[row.status] = row._count._all;
    seatCountsByEvent.set(row.eventId, entry);
  }

  const now = new Date();
  const eventsSummary: OrganiserEventSummary[] = events.map((event) => {
    const seatCounts = seatCountsByEvent.get(event.id) ?? {};
    const bookingAgg = bookingsByEvent.get(event.id);
    return {
      id: event.id,
      title: event.title,
      eventDate: event.eventDate,
      status: event.status,
      venueName: event.venue.name,
      totalSeats: event._count.eventSeats,
      ticketsSold: seatCounts.BOOKED ?? 0,
      availableSeats: seatCounts.AVAILABLE ?? 0,
      revenueMinorUnits: bookingAgg?._sum.totalAmountMinorUnits ?? 0,
      bookingsCount: bookingAgg?._count._all ?? 0,
    };
  });

  return {
    totals: {
      totalEvents: events.length,
      totalBookings: eventsSummary.reduce((sum, e) => sum + e.bookingsCount, 0),
      totalRevenueMinorUnits: eventsSummary.reduce((sum, e) => sum + e.revenueMinorUnits, 0),
      upcomingEvents: events.filter((e) => e.eventDate >= now).length,
    },
    events: eventsSummary,
  };
}
