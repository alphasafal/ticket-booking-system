import { requireAuth } from "@/lib/auth/rbac";
import { getOwnedBookingDetail } from "@/lib/booking/booking-query-service";
import { jsonError, jsonOk } from "@/lib/utils/api-response";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  try {
    const user = await requireAuth();
    const { bookingId } = await params;
    const booking = await getOwnedBookingDetail(bookingId, user.id);
    return jsonOk({ booking });
  } catch (error) {
    return jsonError(error);
  }
}
