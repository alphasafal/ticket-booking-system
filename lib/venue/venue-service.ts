import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { ApiError } from "@/lib/utils/api-error";
import type { AddSeatsInput, CreateVenueInput, UpdateVenueInput } from "@/lib/validation/venue";

export function listVenues() {
  return prisma.venue.findMany({ orderBy: { name: "asc" }, include: { seats: true } });
}

export function getVenue(venueId: string) {
  return prisma.venue.findUnique({ where: { id: venueId }, include: { seats: true } });
}

export function createVenue(input: CreateVenueInput) {
  return prisma.venue.create({ data: input });
}

export async function updateVenue(venueId: string, input: UpdateVenueInput) {
  const venue = await prisma.venue.findUnique({ where: { id: venueId } });
  if (!venue) {
    throw new ApiError("NOT_FOUND", "Venue not found.");
  }
  return prisma.venue.update({ where: { id: venueId }, data: input });
}

export async function addSeatsToVenue(venueId: string, input: AddSeatsInput) {
  const venue = await prisma.venue.findUnique({ where: { id: venueId } });
  if (!venue) {
    throw new ApiError("NOT_FOUND", "Venue not found.");
  }

  try {
    await prisma.seat.createMany({
      data: input.seats.map((seat) => ({ venueId, row: seat.row, number: seat.number, category: seat.category })),
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ApiError("CONFLICT", "One or more seats already exist at that row/number for this venue.");
    }
    throw error;
  }

  return getVenue(venueId);
}
