import { PrismaClient, type SeatCategory } from "@prisma/client";
import bcrypt from "bcryptjs";
import { generateBookingReference } from "../lib/utils/booking-reference";

const prisma = new PrismaClient();

// Non-sensitive demo credentials only — documented in README, never real secrets.
const DEMO_PASSWORD = "password123";

// Fixed id + upsert so re-running the seed never creates duplicate bookings
// for the same demo seats.
async function createBooking(params: {
  id: string;
  eventId: string;
  userId: string;
  eventSeatIds: string[];
  priceByEventSeatId: Map<string, number>;
}) {
  // Re-running the seed restores demo state rather than just skipping: a
  // demo booking someone cancelled while exploring is put back to CONFIRMED
  // with its seats re-marked BOOKED, so `npm run db:seed` reliably returns
  // the app to a known-good starting point.
  const existing = await prisma.booking.findUnique({ where: { id: params.id } });
  if (existing) {
    await prisma.booking.update({
      where: { id: params.id },
      data: { status: "CONFIRMED", cancelledAt: null },
    });
    await prisma.eventSeat.updateMany({
      where: { id: { in: params.eventSeatIds } },
      data: { status: "BOOKED", holdToken: null, holdUserId: null, holdExpiresAt: null },
    });
    return existing;
  }

  const total = params.eventSeatIds.reduce(
    (sum, id) => sum + (params.priceByEventSeatId.get(id) ?? 0),
    0,
  );
  const booking = await prisma.booking.create({
    data: {
      id: params.id,
      reference: generateBookingReference(),
      eventId: params.eventId,
      userId: params.userId,
      totalAmountMinorUnits: total,
      seats: {
        create: params.eventSeatIds.map((eventSeatId) => ({
          eventSeatId,
          priceMinorUnits: params.priceByEventSeatId.get(eventSeatId) ?? 0,
        })),
      },
    },
  });
  await prisma.eventSeat.updateMany({
    where: { id: { in: params.eventSeatIds } },
    data: { status: "BOOKED", holdToken: null, holdUserId: null, holdExpiresAt: null },
  });
  return booking;
}

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  const admin = await prisma.user.upsert({
    where: { email: "admin@ticketbooking.dev" },
    update: {},
    create: { name: "Admin", email: "admin@ticketbooking.dev", passwordHash, role: "ADMIN" },
  });
  const organiser = await prisma.user.upsert({
    where: { email: "organiser@ticketbooking.dev" },
    update: {},
    create: { name: "Priya Organiser", email: "organiser@ticketbooking.dev", passwordHash, role: "ORGANISER" },
  });
  const customer = await prisma.user.upsert({
    where: { email: "customer@ticketbooking.dev" },
    update: {},
    create: { name: "Alex Customer", email: "customer@ticketbooking.dev", passwordHash, role: "CUSTOMER" },
  });
  const waitlistedCustomer = await prisma.user.upsert({
    where: { email: "waitlisted@ticketbooking.dev" },
    update: {},
    create: { name: "Jordan Waitlisted", email: "waitlisted@ticketbooking.dev", passwordHash, role: "CUSTOMER" },
  });

  const venue = await prisma.venue.upsert({
    where: { id: "seed-venue-grand-hall" },
    update: {},
    create: {
      id: "seed-venue-grand-hall",
      name: "Grand Hall Auditorium",
      description: "A 400-seat auditorium in the city center.",
    },
  });

  const seatRows: { row: string; category: SeatCategory }[] = [
    { row: "A", category: "PREMIUM" },
    { row: "B", category: "PREMIUM" },
    { row: "C", category: "STANDARD" },
    { row: "D", category: "STANDARD" },
    { row: "E", category: "STANDARD" },
  ];
  await prisma.seat.createMany({
    data: seatRows.flatMap(({ row, category }) =>
      Array.from({ length: 8 }, (_, i) => ({ venueId: venue.id, row, number: i + 1, category })),
    ),
    skipDuplicates: true,
  });
  const seats = await prisma.seat.findMany({
    where: { venueId: venue.id },
    orderBy: [{ row: "asc" }, { number: "asc" }],
  });

  const in7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const in14Days = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

  const concert = await prisma.event.upsert({
    where: { id: "seed-event-concert" },
    update: {},
    create: {
      id: "seed-event-concert",
      organiserId: organiser.id,
      venueId: venue.id,
      title: "Midnight Echoes — Live in Concert",
      description: "An intimate evening of acoustic sets and new material.",
      type: "CONCERT",
      eventDate: in7Days,
      startTime: in7Days,
      status: "PUBLISHED",
      categoryPrices: {
        connectOrCreate: [
          { where: { eventId_category: { eventId: "seed-event-concert", category: "PREMIUM" } }, create: { category: "PREMIUM", priceMinorUnits: 150000 } },
          { where: { eventId_category: { eventId: "seed-event-concert", category: "STANDARD" } }, create: { category: "STANDARD", priceMinorUnits: 80000 } },
        ],
      },
    },
  });

  const movie = await prisma.event.upsert({
    where: { id: "seed-event-movie" },
    update: {},
    create: {
      id: "seed-event-movie",
      organiserId: organiser.id,
      venueId: venue.id,
      title: "The Last Signal",
      description: "A sci-fi thriller premiere.",
      type: "MOVIE",
      eventDate: in14Days,
      startTime: in14Days,
      status: "PUBLISHED",
      categoryPrices: {
        connectOrCreate: [
          { where: { eventId_category: { eventId: "seed-event-movie", category: "PREMIUM" } }, create: { category: "PREMIUM", priceMinorUnits: 40000 } },
          { where: { eventId_category: { eventId: "seed-event-movie", category: "STANDARD" } }, create: { category: "STANDARD", priceMinorUnits: 25000 } },
        ],
      },
    },
  });

  for (const event of [concert, movie]) {
    await prisma.eventSeat.createMany({
      data: seats.map((seat) => ({ eventId: event.id, seatId: seat.id })),
      skipDuplicates: true,
    });
  }

  const concertPrices = await prisma.eventCategoryPrice.findMany({ where: { eventId: concert.id } });
  const concertPriceByCategory = new Map(concertPrices.map((p) => [p.category, p.priceMinorUnits]));
  const concertEventSeats = await prisma.eventSeat.findMany({
    where: { eventId: concert.id },
    include: { seat: true },
  });
  const concertEventSeatByRowNumber = new Map(concertEventSeats.map((es) => [`${es.seat.row}${es.seat.number}`, es]));
  const priceByEventSeatId = new Map(
    concertEventSeats.map((es) => [es.id, concertPriceByCategory.get(es.seat.category) ?? 0]),
  );

  // Row A (PREMIUM) fully sold out, to demonstrate the waitlist flow.
  const rowASeatIds = Array.from({ length: 8 }, (_, i) => concertEventSeatByRowNumber.get(`A${i + 1}`)!.id);
  await createBooking({
    id: "seed-booking-concert-premium",
    eventId: concert.id,
    userId: customer.id,
    eventSeatIds: rowASeatIds,
    priceByEventSeatId,
  });

  // A couple of STANDARD seats booked too, for booking-history variety.
  const standardBookedIds = [concertEventSeatByRowNumber.get("D1")!.id, concertEventSeatByRowNumber.get("D2")!.id];
  await createBooking({
    id: "seed-booking-concert-standard",
    eventId: concert.id,
    userId: customer.id,
    eventSeatIds: standardBookedIds,
    priceByEventSeatId,
  });

  // One seat left in the HELD state so the seat map demonstrates all three
  // statuses on arrival. Given a long expiry deliberately: a real hold uses
  // DEFAULT_HOLD_TTL_MINUTES and would lapse minutes after seeding, leaving
  // nothing held to look at. This is an ordinary hold row through the normal
  // model — only its TTL is stretched for demo purposes.
  const heldSeat = concertEventSeatByRowNumber.get("C1")!;
  await prisma.eventSeat.update({
    where: { id: heldSeat.id },
    data: {
      status: "HELD",
      holdToken: "seed-demo-hold-token",
      holdUserId: waitlistedCustomer.id,
      holdExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  // Waitlist for the now sold-out PREMIUM category on the concert.
  await prisma.waitlistEntry.upsert({
    where: { id: "seed-waitlist-entry" },
    // Reset back to WAITING so a re-seed undoes any offer made during an
    // earlier walkthrough of the cancellation flow.
    update: { status: "WAITING", offeredSeatId: null, offerExpiresAt: null },
    create: {
      id: "seed-waitlist-entry",
      eventId: concert.id,
      userId: waitlistedCustomer.id,
      category: "PREMIUM",
      status: "WAITING",
    },
  });

  // A couple of bookings on the movie too, for organiser revenue variety.
  const moviePrices = await prisma.eventCategoryPrice.findMany({ where: { eventId: movie.id } });
  const moviePriceByCategory = new Map(moviePrices.map((p) => [p.category, p.priceMinorUnits]));
  const movieEventSeats = await prisma.eventSeat.findMany({ where: { eventId: movie.id }, include: { seat: true } });
  const movieEventSeatByRowNumber = new Map(movieEventSeats.map((es) => [`${es.seat.row}${es.seat.number}`, es]));
  const moviePriceByEventSeatId = new Map(
    movieEventSeats.map((es) => [es.id, moviePriceByCategory.get(es.seat.category) ?? 0]),
  );
  await createBooking({
    id: "seed-booking-movie-standard",
    eventId: movie.id,
    userId: customer.id,
    eventSeatIds: [movieEventSeatByRowNumber.get("B1")!.id, movieEventSeatByRowNumber.get("B2")!.id],
    priceByEventSeatId: moviePriceByEventSeatId,
  });

  console.log("Seed complete.");
  console.log("Demo accounts (password for all: password123):");
  console.log(`  Admin:     ${admin.email}`);
  console.log(`  Organiser: ${organiser.email}`);
  console.log(`  Customer:  ${customer.email}`);
  console.log(`  Waitlisted customer: ${waitlistedCustomer.email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
