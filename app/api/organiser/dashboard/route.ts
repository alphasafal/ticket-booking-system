import { requireAuth, requireRole } from "@/lib/auth/rbac";
import { getOrganiserDashboard } from "@/lib/event/organiser-dashboard-service";
import { jsonError, jsonOk } from "@/lib/utils/api-response";

export async function GET() {
  try {
    const user = await requireAuth();
    requireRole(user, ["ORGANISER"]);
    const dashboard = await getOrganiserDashboard(user.id);
    return jsonOk(dashboard);
  } catch (error) {
    return jsonError(error);
  }
}
