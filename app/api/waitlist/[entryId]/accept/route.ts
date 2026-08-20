import { NextRequest, after } from "next/server";
import { requireAuth } from "@/lib/auth/rbac";
import { acceptWaitlistOffer } from "@/lib/waitlist/waitlist-service";
import { notifyBookingConfirmed } from "@/lib/booking/booking-service";
import { acceptOfferSchema } from "@/lib/validation/waitlist";
import { jsonError, jsonOk } from "@/lib/utils/api-response";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ entryId: string }> },
) {
  try {
    const user = await requireAuth();
    const { entryId } = await params;
    const body = acceptOfferSchema.parse(await request.json());

    const { booking, isNew } = await acceptWaitlistOffer({
      waitlistEntryId: entryId,
      userId: user.id,
      idempotencyKey: body.idempotencyKey,
    });

    if (isNew) {
      // See the checkout route: `after` keeps the serverless invocation alive
      // for this work, which a floating promise would not.
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
