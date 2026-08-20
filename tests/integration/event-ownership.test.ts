import { describe, it, expect, afterEach } from "vitest";
import { createEvent, updateEvent, getEventDetail } from "@/lib/event/event-service";
import { prisma } from "@/lib/db/prisma";
import { createTestUser } from "../helpers/fixtures";

describe("event ownership", () => {
  let venueId: string | undefined;
  let organiserId: string | undefined;
  let intruderId: string | undefined;
  let eventId: string | undefined;

  afterEach(async () => {
    if (eventId) {
      await prisma.eventSeat.deleteMany({ where: { eventId } });
      await prisma.eventCategoryPrice.deleteMany({ where: { eventId } });
      await prisma.event.delete({ where: { id: eventId } });
    }
    if (venueId) {
      await prisma.seat.deleteMany({ where: { venueId } });
      await prisma.venue.delete({ where: { id: venueId } });
    }
    if (organiserId) await prisma.user.delete({ where: { id: organiserId } });
    if (intruderId) await prisma.user.delete({ where: { id: intruderId } });
    venueId = organiserId = intruderId = eventId = undefined;
  });

  it("prevents one organiser from editing another organiser's event", async () => {
    const organiser = await createTestUser("ORGANISER");
    const intruder = await createTestUser("ORGANISER");
    organiserId = organiser.id;
    intruderId = intruder.id;

    const venue = await prisma.venue.create({ data: { name: "Ownership Test Venue" } });
    venueId = venue.id;
    await prisma.seat.create({ data: { venueId: venue.id, row: "A", number: 1, category: "STANDARD" } });

    const event = await createEvent(organiser.id, {
      venueId: venue.id,
      title: "Owned Event",
      type: "CONCERT",
      eventDate: new Date(Date.now() + 86_400_000),
      startTime: new Date(Date.now() + 86_400_000),
      status: "PUBLISHED",
      categoryPrices: [{ category: "STANDARD", priceMinorUnits: 10000 }],
    });
    eventId = event.id;

    await expect(
      updateEvent(event.id, intruder.id, { title: "Hijacked Title" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const unchanged = await getEventDetail(event.id, null);
    expect(unchanged.title).toBe("Owned Event");

    const updated = await updateEvent(event.id, organiser.id, { title: "Updated By Owner" });
    expect(updated.title).toBe("Updated By Owner");
  });
});
