import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/rbac";
import { confirmBooking, notifyBookingConfirmed } from "@/lib/booking/booking-service";
import { checkoutSchema } from "@/lib/validation/booking";
import { jsonError, jsonOk } from "@/lib/utils/api-response";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const user = await requireAuth();
    const { eventId } = await params;
    const body = checkoutSchema.parse(await request.json());

    const { booking, isNew } = await confirmBooking({
      eventId,
      userId: user.id,
      holdToken: body.holdToken,
      idempotencyKey: body.idempotencyKey,
    });

    if (isNew) {
      notifyBookingConfirmed(booking).catch((error) => console.error("Failed to notify booking:", error));
    }

    return jsonOk({ booking }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
