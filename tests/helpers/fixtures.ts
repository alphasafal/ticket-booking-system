import { randomUUID } from "crypto";
import type { Role, SeatCategory } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { hashPassword } from "@/lib/auth/password";

export async function createTestUser(role: Role = "CUSTOMER") {
  return prisma.user.create({
    data: {
      name: "Test User",
      email: `test-${randomUUID()}@example.com`,
      passwordHash: await hashPassword("password123"),
      role,
    },
  });
}

export async function createTestEventWithSeats(options?: {
  seatCount?: number;
  category?: SeatCategory;
  priceMinorUnits?: number;
}) {
  const seatCount = options?.seatCount ?? 5;
  const category = options?.category ?? "STANDARD";
  const priceMinorUnits = options?.priceMinorUnits ?? 50000;

  const organiser = await createTestUser("ORGANISER");
  const venue = await prisma.venue.create({
    data: { name: `Test Venue ${randomUUID()}` },
  });

  const seats = await Promise.all(
    Array.from({ length: seatCount }).map((_, i) =>
      prisma.seat.create({
        data: { venueId: venue.id, row: "A", number: i + 1, category },
      }),
    ),
  );

  const event = await prisma.event.create({
    data: {
      organiserId: organiser.id,
      venueId: venue.id,
      title: "Test Event",
      type: "CONCERT",
      eventDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      startTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      status: "PUBLISHED",
      categoryPrices: {
        create: [{ category, priceMinorUnits }],
      },
    },
  });

  const eventSeats = await Promise.all(
    seats.map((seat) => prisma.eventSeat.create({ data: { eventId: event.id, seatId: seat.id } })),
  );

  return { organiser, venue, seats, event, eventSeats };
}

export async function cleanupEventFixture(fixture: {
  event: { id: string };
  venue: { id: string };
  organiser: { id: string };
  extraUserIds?: string[];
}) {
  const { event, venue, organiser } = fixture;
  await prisma.bookingSeat.deleteMany({ where: { eventSeat: { eventId: event.id } } });
  await prisma.booking.deleteMany({ where: { eventId: event.id } });
  await prisma.waitlistEntry.deleteMany({ where: { eventId: event.id } });
  await prisma.eventSeat.deleteMany({ where: { eventId: event.id } });
  await prisma.eventCategoryPrice.deleteMany({ where: { eventId: event.id } });
  await prisma.event.delete({ where: { id: event.id } });
  await prisma.seat.deleteMany({ where: { venueId: venue.id } });
  await prisma.venue.delete({ where: { id: venue.id } });
  await prisma.user.delete({ where: { id: organiser.id } });
  if (fixture.extraUserIds?.length) {
    await prisma.user.deleteMany({ where: { id: { in: fixture.extraUserIds } } });
  }
}
