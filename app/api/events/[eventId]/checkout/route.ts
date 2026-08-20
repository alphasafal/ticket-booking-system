import { NextRequest, after } from "next/server";
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
      // Deliberately deferred rather than awaited, so a slow QR render or
      // email API call never delays the customer's confirmation. `after`
      // (not a bare floating promise) is what keeps the serverless
      // invocation alive until this finishes — otherwise the function can be
      // frozen the moment the response is returned and the email is
      // silently dropped.
      after(async () => {
        try {
          await notifyBookingConfirmed(booking);
        } catch (error) {
          console.error("Failed to notify booking:", error);
        }
      });
    }

    return jsonOk({ booking }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
