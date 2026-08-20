import { NextRequest } from "next/server";
import { requireAuth, requireRole } from "@/lib/auth/rbac";
import { addSeatsToVenue } from "@/lib/venue/venue-service";
import { addSeatsSchema } from "@/lib/validation/venue";
import { jsonError, jsonOk } from "@/lib/utils/api-response";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ venueId: string }> },
) {
  try {
    const user = await requireAuth();
    requireRole(user, ["ADMIN"]);
    const { venueId } = await params;
    const body = addSeatsSchema.parse(await request.json());

    const venue = await addSeatsToVenue(venueId, body);
    return jsonOk({ venue }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
