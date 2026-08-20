import { requireAuth } from "@/lib/auth/rbac";
import { cancelBooking } from "@/lib/booking/cancellation-service";
import { jsonError, jsonOk } from "@/lib/utils/api-response";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  try {
    const user = await requireAuth();
    const { bookingId } = await params;
    await cancelBooking({ bookingId, userId: user.id });
    return jsonOk({ success: true });
  } catch (error) {
    return jsonError(error);
  }
}
