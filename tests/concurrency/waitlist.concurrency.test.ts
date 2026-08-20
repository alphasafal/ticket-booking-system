import { randomUUID } from "crypto";
import { describe, it, expect, afterEach } from "vitest";
import { holdSeats } from "@/lib/seat/hold-service";
import { confirmBooking } from "@/lib/booking/booking-service";
import { cancelBooking } from "@/lib/booking/cancellation-service";
import { joinWaitlist, acceptWaitlistOffer, expireAndAdvanceOffer } from "@/lib/waitlist/waitlist-service";
import { prisma } from "@/lib/db/prisma";
import { createTestEventWithSeats, createTestUser, cleanupEventFixture } from "../helpers/fixtures";
import { ApiError } from "@/lib/utils/api-error";

async function bookSeat(eventId: string, userId: string, seatId: string) {
  const hold = await holdSeats({ eventId, userId, seatIds: [seatId] });
  const { booking } = await confirmBooking({ eventId, userId, holdToken: hold.holdToken, idempotencyKey: randomUUID() });
  return booking;
}

describe("waitlist", () => {
  let fixture: Awaited<ReturnType<typeof createTestEventWithSeats>>;
  let extraUserIds: string[] = [];

  afterEach(async () => {
    if (fixture) {
      await cleanupEventFixture({ ...fixture, extraUserIds });
    }
    extraUserIds = [];
  });

  it("offers a cancelled seat to the earliest waiting customer (FIFO)", async () => {
    fixture = await createTestEventWithSeats({ seatCount: 1 });
    const seatId = fixture.seats[0].id;
    const buyer = await createTestUser();
    const firstInLine = await createTestUser();
    const secondInLine = await createTestUser();
    extraUserIds = [buyer.id, firstInLine.id, secondInLine.id];

    const booking = await bookSeat(fixture.event.id, buyer.id, seatId);

    await joinWaitlist({ eventId: fixture.event.id, userId: firstInLine.id, category: "STANDARD" });
    await joinWaitlist({ eventId: fixture.event.id, userId: secondInLine.id, category: "STANDARD" });

    await cancelBooking({ bookingId: booking.id, userId: buyer.id });

    const entries = await prisma.waitlistEntry.findMany({ where: { eventId: fixture.event.id } });
    const firstEntry = entries.find((e) => e.userId === firstInLine.id)!;
    const secondEntry = entries.find((e) => e.userId === secondInLine.id)!;

    expect(firstEntry.status).toBe("OFFERED");
    expect(firstEntry.offeredSeatId).toBe((await prisma.eventSeat.findFirst({ where: { eventId: fixture.event.id } }))!.id);
    expect(secondEntry.status).toBe("WAITING");

    const seat = await prisma.eventSeat.findFirst({ where: { eventId: fixture.event.id } });
    expect(seat!.status).toBe("HELD");
  });

  it("prevents duplicate active waitlist entries for the same user/event/category", async () => {
    fixture = await createTestEventWithSeats({ seatCount: 1 });
    const user = await createTestUser();
    extraUserIds = [user.id];

    await joinWaitlist({ eventId: fixture.event.id, userId: user.id, category: "STANDARD" });
    await expect(
      joinWaitlist({ eventId: fixture.event.id, userId: user.id, category: "STANDARD" }),
    ).rejects.toMatchObject({ code: "DUPLICATE_WAITLIST_ENTRY" });
  });

  it("only lets the offered user accept, and only once, under concurrent acceptance attempts", async () => {
    fixture = await createTestEventWithSeats({ seatCount: 1 });
    const seatId = fixture.seats[0].id;
    const buyer = await createTestUser();
    const waiter = await createTestUser();
    extraUserIds = [buyer.id, waiter.id];

    const booking = await bookSeat(fixture.event.id, buyer.id, seatId);
    await joinWaitlist({ eventId: fixture.event.id, userId: waiter.id, category: "STANDARD" });
    await cancelBooking({ bookingId: booking.id, userId: buyer.id });

    const entry = await prisma.waitlistEntry.findFirstOrThrow({
      where: { eventId: fixture.event.id, userId: waiter.id },
    });

    // Distinct idempotency keys, so each attempt genuinely races to lock and
    // consume the same WaitlistEntry row rather than deduping on the key.
    const attempts = await Promise.allSettled(
      Array.from({ length: 5 }).map(() =>
        acceptWaitlistOffer({ waitlistEntryId: entry.id, userId: waiter.id, idempotencyKey: randomUUID() }),
      ),
    );

    const fulfilled = attempts.filter((a) => a.status === "fulfilled");
    const rejected = attempts.filter((a) => a.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(4);
    for (const r of rejected) {
      expect((r as PromiseRejectedResult).reason).toBeInstanceOf(ApiError);
      expect(((r as PromiseRejectedResult).reason as ApiError).code).toBe("OFFER_EXPIRED");
    }

    // Two BookingSeat rows exist in total for this seat across its history
    // (the original buyer's cancelled booking, plus the waitlist winner's),
    // but only one may belong to a currently CONFIRMED booking.
    const confirmedBookingsForSeat = await prisma.bookingSeat.count({
      where: { eventSeat: { eventId: fixture.event.id, seatId }, booking: { status: "CONFIRMED" } },
    });
    expect(confirmedBookingsForSeat).toBe(1);
  }, 20_000);

  it("rejects acceptance by a user other than the one offered the seat", async () => {
    fixture = await createTestEventWithSeats({ seatCount: 1 });
    const seatId = fixture.seats[0].id;
    const buyer = await createTestUser();
    const waiter = await createTestUser();
    const intruder = await createTestUser();
    extraUserIds = [buyer.id, waiter.id, intruder.id];

    const booking = await bookSeat(fixture.event.id, buyer.id, seatId);
    await joinWaitlist({ eventId: fixture.event.id, userId: waiter.id, category: "STANDARD" });
    await cancelBooking({ bookingId: booking.id, userId: buyer.id });

    const entry = await prisma.waitlistEntry.findFirstOrThrow({
      where: { eventId: fixture.event.id, userId: waiter.id },
    });

    await expect(
      acceptWaitlistOffer({ waitlistEntryId: entry.id, userId: intruder.id, idempotencyKey: randomUUID() }),
    ).rejects.toMatchObject({ code: "OFFER_OWNER_MISMATCH" });
  });

  it("expires an offer and advances it to the next waiting customer", async () => {
    fixture = await createTestEventWithSeats({ seatCount: 1 });
    const seatId = fixture.seats[0].id;
    const buyer = await createTestUser();
    const firstInLine = await createTestUser();
    const secondInLine = await createTestUser();
    extraUserIds = [buyer.id, firstInLine.id, secondInLine.id];

    const booking = await bookSeat(fixture.event.id, buyer.id, seatId);
    await joinWaitlist({ eventId: fixture.event.id, userId: firstInLine.id, category: "STANDARD" });
    await joinWaitlist({ eventId: fixture.event.id, userId: secondInLine.id, category: "STANDARD" });
    await cancelBooking({ bookingId: booking.id, userId: buyer.id });

    const firstEntry = await prisma.waitlistEntry.findFirstOrThrow({
      where: { eventId: fixture.event.id, userId: firstInLine.id },
    });

    await prisma.waitlistEntry.update({ where: { id: firstEntry.id }, data: { offerExpiresAt: new Date(Date.now() - 1000) } });
    await expireAndAdvanceOffer(firstEntry.id);

    const [expired, secondEntry] = await Promise.all([
      prisma.waitlistEntry.findUniqueOrThrow({ where: { id: firstEntry.id } }),
      prisma.waitlistEntry.findFirstOrThrow({ where: { eventId: fixture.event.id, userId: secondInLine.id } }),
    ]);

    expect(expired.status).toBe("EXPIRED");
    expect(secondEntry.status).toBe("OFFERED");

    await expect(
      acceptWaitlistOffer({ waitlistEntryId: firstEntry.id, userId: firstInLine.id, idempotencyKey: randomUUID() }),
    ).rejects.toMatchObject({ code: "OFFER_EXPIRED" });
  });

  it("releases the seat to AVAILABLE when no one is waiting", async () => {
    fixture = await createTestEventWithSeats({ seatCount: 1 });
    const seatId = fixture.seats[0].id;
    const buyer = await createTestUser();
    extraUserIds = [buyer.id];

    const booking = await bookSeat(fixture.event.id, buyer.id, seatId);
    await cancelBooking({ bookingId: booking.id, userId: buyer.id });

    const seat = await prisma.eventSeat.findFirst({ where: { eventId: fixture.event.id } });
    expect(seat!.status).toBe("AVAILABLE");
  });

  it("cannot be cancelled twice", async () => {
    fixture = await createTestEventWithSeats({ seatCount: 1 });
    const buyer = await createTestUser();
    extraUserIds = [buyer.id];

    const booking = await bookSeat(fixture.event.id, buyer.id, fixture.seats[0].id);
    await cancelBooking({ bookingId: booking.id, userId: buyer.id });

    await expect(cancelBooking({ bookingId: booking.id, userId: buyer.id })).rejects.toMatchObject({
      code: "ALREADY_CANCELLED",
    });
  });
});
