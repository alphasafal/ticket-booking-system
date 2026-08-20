import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/rbac";
import { holdSeats } from "@/lib/seat/hold-service";
import { holdSeatsSchema } from "@/lib/validation/seat";
import { jsonError, jsonOk } from "@/lib/utils/api-response";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const user = await requireAuth();
    const { eventId } = await params;
    const body = holdSeatsSchema.parse(await request.json());

    const hold = await holdSeats({ eventId, userId: user.id, seatIds: body.seatIds });
    return jsonOk({ hold }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
