import { NextRequest } from "next/server";
import { requireAuth, requireRole } from "@/lib/auth/rbac";
import { createEvent, listPublishedEvents } from "@/lib/event/event-service";
import { createEventSchema, listEventsQuerySchema } from "@/lib/validation/event";
import { jsonError, jsonOk } from "@/lib/utils/api-response";

export async function GET(request: NextRequest) {
  try {
    const query = listEventsQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams.entries()),
    );
    const events = await listPublishedEvents(query);
    return jsonOk({ events });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    requireRole(user, ["ORGANISER"]);
    const body = createEventSchema.parse(await request.json());

    const event = await createEvent(user.id, body);
    return jsonOk({ event }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
