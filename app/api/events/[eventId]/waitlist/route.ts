import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/rbac";
import { joinWaitlist } from "@/lib/waitlist/waitlist-service";
import { joinWaitlistSchema } from "@/lib/validation/waitlist";
import { jsonError, jsonOk } from "@/lib/utils/api-response";
import { prisma } from "@/lib/db/prisma";

// Returns the current user's own waitlist entries for this event.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const user = await requireAuth();
    const { eventId } = await params;
    const entries = await prisma.waitlistEntry.findMany({
      where: { eventId, userId: user.id },
      orderBy: { createdAt: "desc" },
    });
    return jsonOk({ entries });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const user = await requireAuth();
    const { eventId } = await params;
    const body = joinWaitlistSchema.parse(await request.json());

    const entry = await joinWaitlist({ eventId, userId: user.id, category: body.category });
    return jsonOk({ entry }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
