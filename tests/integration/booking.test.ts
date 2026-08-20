import { randomUUID } from "crypto";
import { describe, it, expect, afterEach } from "vitest";
import { holdSeats } from "@/lib/seat/hold-service";
import { confirmBooking } from "@/lib/booking/booking-service";
import { prisma } from "@/lib/db/prisma";
import { createTestEventWithSeats, createTestUser, cleanupEventFixture } from "../helpers/fixtures";

describe("booking confirmation", () => {
  let fixture: Awaited<ReturnType<typeof createTestEventWithSeats>>;
  let extraUserIds: string[] = [];

  afterEach(async () => {
    if (fixture) {
      await cleanupEventFixture({ ...fixture, extraUserIds });
    }
    extraUserIds = [];
  });

  it("confirms a held seat into a booking with the correct total", async () => {
    fixture = await createTestEventWithSeats({ seatCount: 2, priceMinorUnits: 75000 });
    const user = await createTestUser();
    extraUserIds = [user.id];

    const hold = await holdSeats({
      eventId: fixture.event.id,
      userId: user.id,
      seatIds: fixture.seats.map((s) => s.id),
    });

    const booking = await confirmBooking({
      eventId: fixture.event.id,
      userId: user.id,
      holdToken: hold.holdToken,
      idempotencyKey: randomUUID(),
    });

    expect(booking.reference).toMatch(/^TB-[A-Z0-9]{8}$/);
    expect(booking.totalAmountMinorUnits).toBe(150000);
    expect(booking.seats).toHaveLength(2);

    const seatStates = await prisma.eventSeat.findMany({ where: { eventId: fixture.event.id } });
    expect(seatStates.every((s) => s.status === "BOOKED")).toBe(true);
    expect(seatStates.every((s) => s.holdToken === null)).toBe(true);
  });

  it("returns the same booking when the same idempotency key is retried", async () => {
    fixture = await createTestEventWithSeats({ seatCount: 1 });
    const user = await createTestUser();
    extraUserIds = [user.id];

    const hold = await holdSeats({ eventId: fixture.event.id, userId: user.id, seatIds: [fixture.seats[0].id] });
    const idempotencyKey = randomUUID();

    const first = await confirmBooking({ eventId: fixture.event.id, userId: user.id, holdToken: hold.holdToken, idempotencyKey });
    const second = await confirmBooking({ eventId: fixture.event.id, userId: user.id, holdToken: hold.holdToken, idempotencyKey });

    expect(second.id).toBe(first.id);
    const bookingCount = await prisma.booking.count({ where: { eventId: fixture.event.id } });
    expect(bookingCount).toBe(1);
  });

  it("rejects checkout with an expired hold", async () => {
    fixture = await createTestEventWithSeats({ seatCount: 1 });
    const user = await createTestUser();
    extraUserIds = [user.id];

    const hold = await holdSeats({ eventId: fixture.event.id, userId: user.id, seatIds: [fixture.seats[0].id] });
    await prisma.eventSeat.updateMany({
      where: { eventId: fixture.event.id },
      data: { holdExpiresAt: new Date(Date.now() - 1000) },
    });

    await expect(
      confirmBooking({ eventId: fixture.event.id, userId: user.id, holdToken: hold.holdToken, idempotencyKey: randomUUID() }),
    ).rejects.toMatchObject({ code: "HOLD_EXPIRED" });
  });

  it("rejects checkout when the hold belongs to a different user", async () => {
    fixture = await createTestEventWithSeats({ seatCount: 1 });
    const owner = await createTestUser();
    const intruder = await createTestUser();
    extraUserIds = [owner.id, intruder.id];

    const hold = await holdSeats({ eventId: fixture.event.id, userId: owner.id, seatIds: [fixture.seats[0].id] });

    await expect(
      confirmBooking({ eventId: fixture.event.id, userId: intruder.id, holdToken: hold.holdToken, idempotencyKey: randomUUID() }),
    ).rejects.toMatchObject({ code: "HOLD_OWNER_MISMATCH" });
  });

  it("rejects an unknown hold token", async () => {
    fixture = await createTestEventWithSeats({ seatCount: 1 });
    const user = await createTestUser();
    extraUserIds = [user.id];

    await expect(
      confirmBooking({ eventId: fixture.event.id, userId: user.id, holdToken: "not-a-real-token", idempotencyKey: randomUUID() }),
    ).rejects.toMatchObject({ code: "HOLD_NOT_FOUND" });
  });
});
