import { requireAuth } from "@/lib/auth/rbac";
import { listUserBookings } from "@/lib/booking/booking-query-service";
import { jsonError, jsonOk } from "@/lib/utils/api-response";

export async function GET() {
  try {
    const user = await requireAuth();
    const bookings = await listUserBookings(user.id);
    return jsonOk({ bookings });
  } catch (error) {
    return jsonError(error);
  }
}
