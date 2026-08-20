import { getCurrentUser } from "@/lib/auth/current-user";
import { getEventSeatMap } from "@/lib/seat/seat-map-service";
import { jsonError, jsonOk } from "@/lib/utils/api-response";

export async function GET(_request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  try {
    const { eventId } = await params;
    const user = await getCurrentUser();
    const seats = await getEventSeatMap(eventId, user?.id ?? null);
    return jsonOk({ seats });
  } catch (error) {
    return jsonError(error);
  }
}
