import { describe, it, expect, afterEach } from "vitest";
import { holdSeats } from "@/lib/seat/hold-service";
import { prisma } from "@/lib/db/prisma";
import { createTestEventWithSeats, createTestUser, cleanupEventFixture } from "../helpers/fixtures";
import { ApiError } from "@/lib/utils/api-error";

describe("concurrent seat holds", () => {
  let fixture: Awaited<ReturnType<typeof createTestEventWithSeats>>;
  let extraUserIds: string[] = [];

  afterEach(async () => {
    if (fixture) {
      await cleanupEventFixture({ ...fixture, extraUserIds });
    }
    extraUserIds = [];
  });

  it("allows exactly one winner when 20 users race for the same seat", async () => {
    // 20 requests serialize on one row lock, so this legitimately takes
    // longer than the default per-test timeout.
    fixture = await createTestEventWithSeats({ seatCount: 1 });
    const seatId = fixture.seats[0].id;

    const users = await Promise.all(Array.from({ length: 20 }).map(() => createTestUser()));
    extraUserIds = users.map((u) => u.id);

    const results = await Promise.allSettled(
      users.map((user) => holdSeats({ eventId: fixture.event.id, userId: user.id, seatIds: [seatId] })),
    );

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(19);
    for (const r of rejected) {
      const reason = (r as PromiseRejectedResult).reason;
      expect(reason).toBeInstanceOf(ApiError);
      expect((reason as ApiError).code).toBe("SEAT_UNAVAILABLE");
    }

    const eventSeat = await prisma.eventSeat.findUniqueOrThrow({
      where: { eventId_seatId: { eventId: fixture.event.id, seatId } },
    });
    expect(eventSeat.status).toBe("HELD");
  }, 20_000);

  it("holds disjoint seats concurrently without contention", async () => {
    fixture = await createTestEventWithSeats({ seatCount: 4 });
    const users = await Promise.all(Array.from({ length: 4 }).map(() => createTestUser()));
    extraUserIds = users.map((u) => u.id);

    const results = await Promise.allSettled(
      fixture.seats.map((seat, i) =>
        holdSeats({ eventId: fixture.event.id, userId: users[i].id, seatIds: [seat.id] }),
      ),
    );

    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
  });

  it("holds none of a multi-seat request if any seat is unavailable (no partial holds)", async () => {
    fixture = await createTestEventWithSeats({ seatCount: 2 });
    const [seatA, seatB] = fixture.seats;
    const userOne = await createTestUser();
    const userTwo = await createTestUser();
    extraUserIds = [userOne.id, userTwo.id];

    await holdSeats({ eventId: fixture.event.id, userId: userOne.id, seatIds: [seatB.id] });

    await expect(
      holdSeats({ eventId: fixture.event.id, userId: userTwo.id, seatIds: [seatA.id, seatB.id] }),
    ).rejects.toMatchObject({ code: "SEAT_UNAVAILABLE" });

    const seatAState = await prisma.eventSeat.findUniqueOrThrow({
      where: { eventId_seatId: { eventId: fixture.event.id, seatId: seatA.id } },
    });
    expect(seatAState.status).toBe("AVAILABLE");
  });

  it("allows a new hold once the previous hold has expired", async () => {
    fixture = await createTestEventWithSeats({ seatCount: 1 });
    const seatId = fixture.seats[0].id;
    const userOne = await createTestUser();
    const userTwo = await createTestUser();
    extraUserIds = [userOne.id, userTwo.id];

    const firstHold = await holdSeats({ eventId: fixture.event.id, userId: userOne.id, seatIds: [seatId] });

    await prisma.eventSeat.update({
      where: { eventId_seatId: { eventId: fixture.event.id, seatId } },
      data: { holdExpiresAt: new Date(Date.now() - 1000) },
    });

    const secondHold = await holdSeats({ eventId: fixture.event.id, userId: userTwo.id, seatIds: [seatId] });
    expect(secondHold.holdToken).not.toBe(firstHold.holdToken);
  });
});
