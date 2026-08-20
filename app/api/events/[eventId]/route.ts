import { NextRequest } from "next/server";
import { requireAuth, requireRole } from "@/lib/auth/rbac";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getEventDetail, updateEvent } from "@/lib/event/event-service";
import { updateEventSchema } from "@/lib/validation/event";
import { jsonError, jsonOk } from "@/lib/utils/api-response";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const { eventId } = await params;
    const viewer = await getCurrentUser();
    const event = await getEventDetail(eventId, viewer);
    return jsonOk({ event });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const user = await requireAuth();
    requireRole(user, ["ORGANISER"]);
    const { eventId } = await params;
    const body = updateEventSchema.parse(await request.json());

    const event = await updateEvent(eventId, user.id, body);
    return jsonOk({ event });
  } catch (error) {
    return jsonError(error);
  }
}
