import { NextRequest } from "next/server";
import { requireAuth, requireRole } from "@/lib/auth/rbac";
import { getVenue, updateVenue } from "@/lib/venue/venue-service";
import { updateVenueSchema } from "@/lib/validation/venue";
import { ApiError } from "@/lib/utils/api-error";
import { jsonError, jsonOk } from "@/lib/utils/api-response";

export async function GET(_request: Request, { params }: { params: Promise<{ venueId: string }> }) {
  try {
    const { venueId } = await params;
    const venue = await getVenue(venueId);
    if (!venue) {
      throw new ApiError("NOT_FOUND", "Venue not found.");
    }
    return jsonOk({ venue });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ venueId: string }> },
) {
  try {
    const user = await requireAuth();
    requireRole(user, ["ADMIN"]);
    const { venueId } = await params;
    const body = updateVenueSchema.parse(await request.json());

    const venue = await updateVenue(venueId, body);
    return jsonOk({ venue });
  } catch (error) {
    return jsonError(error);
  }
}
