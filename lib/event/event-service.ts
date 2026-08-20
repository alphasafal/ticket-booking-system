import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { ApiError } from "@/lib/utils/api-error";
import type { CreateEventInput, UpdateEventInput } from "@/lib/validation/event";

const eventDetailInclude = {
  venue: true,
  categoryPrices: true,
} as const satisfies Prisma.EventInclude;

export async function createEvent(organiserId: string, input: CreateEventInput) {
  const venue = await prisma.venue.findUnique({ where: { id: input.venueId }, include: { seats: true } });
  if (!venue) {
    throw new ApiError("NOT_FOUND", "Venue not found.");
  }
  if (venue.seats.length === 0) {
    throw new ApiError("VALIDATION_ERROR", "This venue has no seats configured yet.");
  }

  return prisma.$transaction(async (tx) => {
    const event = await tx.event.create({
      data: {
        organiserId,
        venueId: input.venueId,
        title: input.title,
        description: input.description,
        type: input.type,
        eventDate: input.eventDate,
        startTime: input.startTime,
        status: input.status,
        categoryPrices: { create: input.categoryPrices },
      },
      include: eventDetailInclude,
    });

    // Every physical seat in the venue gets its own per-event inventory row.
    await tx.eventSeat.createMany({
      data: venue.seats.map((seat) => ({ eventId: event.id, seatId: seat.id })),
    });

    return event;
  });
}

export async function updateEvent(eventId: string, organiserId: string, input: UpdateEventInput) {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) {
    throw new ApiError("NOT_FOUND", "Event not found.");
  }
  if (event.organiserId !== organiserId) {
    throw new ApiError("FORBIDDEN", "You do not own this event.");
  }

  return prisma.event.update({ where: { id: eventId }, data: input, include: eventDetailInclude });
}

export function listPublishedEvents(filters: { type?: string; search?: string }) {
  return prisma.event.findMany({
    where: {
      status: "PUBLISHED",
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.search ? { title: { contains: filters.search, mode: "insensitive" } } : {}),
    },
    orderBy: { eventDate: "asc" },
    include: eventDetailInclude,
  });
}

export function listOrganiserEvents(organiserId: string) {
  return prisma.event.findMany({
    where: { organiserId },
    orderBy: { eventDate: "asc" },
    include: eventDetailInclude,
  });
}

export async function getEventDetail(eventId: string, viewer: { id: string; role: string } | null) {
  const event = await prisma.event.findUnique({ where: { id: eventId }, include: eventDetailInclude });
  if (!event) {
    throw new ApiError("NOT_FOUND", "Event not found.");
  }

  const isOwnerOrAdmin = viewer && (viewer.id === event.organiserId || viewer.role === "ADMIN");
  if (event.status === "DRAFT" && !isOwnerOrAdmin) {
    throw new ApiError("NOT_FOUND", "Event not found.");
  }

  return event;
}
