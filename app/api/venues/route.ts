import { NextRequest } from "next/server";
import { requireAuth, requireRole } from "@/lib/auth/rbac";
import { createVenue, listVenues } from "@/lib/venue/venue-service";
import { createVenueSchema } from "@/lib/validation/venue";
import { jsonError, jsonOk } from "@/lib/utils/api-response";

export async function GET() {
  try {
    const venues = await listVenues();
    return jsonOk({ venues });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    requireRole(user, ["ADMIN"]);
    const body = createVenueSchema.parse(await request.json());

    const venue = await createVenue(body);
    return jsonOk({ venue }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
