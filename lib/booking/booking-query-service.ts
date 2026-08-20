import { prisma } from "@/lib/db/prisma";
import { ApiError } from "@/lib/utils/api-error";

const bookingDetailInclude = {
  event: { include: { venue: true } },
  seats: { include: { eventSeat: { include: { seat: true } } } },
} as const;

export function listUserBookings(userId: string) {
  return prisma.booking.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: bookingDetailInclude,
  });
}

export async function getOwnedBookingDetail(bookingId: string, userId: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: bookingDetailInclude,
  });
  if (!booking) {
    throw new ApiError("NOT_FOUND", "Booking not found.");
  }
  if (booking.userId !== userId) {
    throw new ApiError("FORBIDDEN", "You do not own this booking.");
  }
  return booking;
}
