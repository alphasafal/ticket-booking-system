import { randomUUID } from "crypto";
import { describe, it, expect, afterEach } from "vitest";
import { holdSeats } from "@/lib/seat/hold-service";
import { confirmBooking } from "@/lib/booking/booking-service";
import { getOrganiserDashboard } from "@/lib/event/organiser-dashboard-service";
import { prisma } from "@/lib/db/prisma";
import { createTestEventWithSeats, createTestUser, cleanupEventFixture } from "../helpers/fixtures";

describe("organiser dashboard", () => {
  let fixture: Awaited<ReturnType<typeof createTestEventWithSeats>>;
  let extraUserIds: string[] = [];

  afterEach(async () => {
    if (fixture) await cleanupEventFixture({ ...fixture, extraUserIds });
    extraUserIds = [];
  });

  it("counts an expired hold as available, not as held", async () => {
    fixture = await createTestEventWithSeats({ seatCount: 4, priceMinorUnits: 50000 });
    const user = await createTestUser();
    extraUserIds = [user.id];

    const baseline = await getOrganiserDashboard(fixture.organiser.id);
    expect(baseline.events[0].availableSeats).toBe(4);

    // Hold a seat, then push its TTL into the past without reconciling.
    await holdSeats({ eventId: fixture.event.id, userId: user.id, seatIds: [fixture.seats[0].id] });
    await prisma.eventSeat.updateMany({
      where: { eventId: fixture.event.id, status: "HELD" },
      data: { holdExpiresAt: new Date(Date.now() - 60_000) },
    });

    // The hold is expired, so the seat is effectively free again and the
    // dashboard must not report it as unavailable.
    const afterExpiry = await getOrganiserDashboard(fixture.organiser.id);
    expect(afterExpiry.events[0].availableSeats).toBe(4);
    expect(afterExpiry.events[0].ticketsSold).toBe(0);
  });

  it("reports tickets sold and revenue from confirmed bookings only", async () => {
    fixture = await createTestEventWithSeats({ seatCount: 4, priceMinorUnits: 50000 });
    const user = await createTestUser();
    extraUserIds = [user.id];

    const hold = await holdSeats({
      eventId: fixture.event.id,
      userId: user.id,
      seatIds: [fixture.seats[0].id, fixture.seats[1].id],
    });
    await confirmBooking({
      eventId: fixture.event.id,
      userId: user.id,
      holdToken: hold.holdToken,
      idempotencyKey: randomUUID(),
    });

    const dashboard = await getOrganiserDashboard(fixture.organiser.id);
    const event = dashboard.events[0];
    expect(event.ticketsSold).toBe(2);
    expect(event.availableSeats).toBe(2);
    expect(event.revenueMinorUnits).toBe(100000);
    expect(event.bookingsCount).toBe(1);
    expect(dashboard.totals.totalRevenueMinorUnits).toBe(100000);
  });

  it("excludes a cancelled booking's revenue and frees its seats", async () => {
    fixture = await createTestEventWithSeats({ seatCount: 2, priceMinorUnits: 50000 });
    const user = await createTestUser();
    extraUserIds = [user.id];

    const hold = await holdSeats({
      eventId: fixture.event.id,
      userId: user.id,
      seatIds: [fixture.seats[0].id],
    });
    const { booking } = await confirmBooking({
      eventId: fixture.event.id,
      userId: user.id,
      holdToken: hold.holdToken,
      idempotencyKey: randomUUID(),
    });

    const { cancelBooking } = await import("@/lib/booking/cancellation-service");
    await cancelBooking({ bookingId: booking.id, userId: user.id });

    const dashboard = await getOrganiserDashboard(fixture.organiser.id);
    expect(dashboard.events[0].revenueMinorUnits).toBe(0);
    expect(dashboard.events[0].ticketsSold).toBe(0);
    expect(dashboard.events[0].availableSeats).toBe(2);
  });
});
